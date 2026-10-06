import { icons } from '../icons/icon.js';
import { ERR, AppError } from './errors.js';

const headerIconEl = document.getElementById('headerIcon');
if (headerIconEl) {
  headerIconEl.innerHTML = icons.speaker;
}

const API_BASE = 'https://englishvast.com';

const STORE_KEY = 'lyricfill:v2:session';
const COUNTS = [5, 10, 15, 20, 25, 30];
const DIFFICULTIES = [1, 2, 3, 4, 5];
const AUTO_RESUME_MS = 10000;
const SCROLL_BEHAVIOR = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

const YT_ERRORS = {
  2: 'ID video tidak valid.',
  5: 'Video tidak bisa diputar di player HTML5.',
  100: 'Video tidak ditemukan atau bersifat privat.',
  101: 'Pemilik video tidak mengizinkan pemutaran di situs lain. Coba video lain.',
  150: 'Pemilik video tidak mengizinkan pemutaran di situs lain. Coba video lain.',
  153: 'Player gagal dimuat. Buka halaman lewat http(s), bukan file://.',
};

function fmt(seconds) {
  const t = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const YT_ID = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/;
function extractVideoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  return s.match(YT_ID)?.[1] ?? null;
}

function distributeEvenly(lines, duration) {
  const step = duration > 0 ? duration / (lines.length + 1) : 3;
  lines.forEach((l, i) => {
    l.time = step * (i + 1);
  });
}

const WORD_PARTS = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u;
const lettersOnly = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function locateWord(text, q) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const parts = (i) => {
    const m = tokens[i]?.match(WORD_PARTS);
    return m && lettersOnly(m[2]) === lettersOnly(q.answerKey) ? m : null;
  };
  let idx = q.wordIndex;
  let m = parts(idx);
  if (!m) {
    idx = tokens.findIndex((_, i) => !!parts(i));
    if (idx < 0) return null;
    m = parts(idx);
  }
  return { tokens, index: idx, prefix: m[1], core: m[2], suffix: m[3] };
}

const $ = (id) => document.getElementById(id);
const els = {
  playBtn: $('playBtn'), playIcon: $('playIcon'), playText: $('playText'),
  progress: $('progressContainer'), progressBar: $('progressBar'), time: $('timeDisplay'),
  sidebarBtn: $('sidebarBtn'), sidebar: $('sidebar'), closeSidebar: $('closeSidebar'),
  ytLink: $('ytLink'), ytStatus: $('ytStatus'),
  lyricInput: $('lyricInput'), lyricStatus: $('lyricStatus'),
  counts: $('questionCount'), countError: $('countError'),
  difficulty: $('difficultyLevel'), difficultyError: $('difficultyError'),
  resetBtn: $('resetBtn'), generateBtn: $('generateBtn'), genSpinner: $('genSpinner'),
  lyrics: $('lyricsContainer'), followLyrics: $('followLyrics'),
  lyricSourceIcon: $('lyricSourceIcon'),
  quiz: $('quizContainer'), followQuiz: $('followQuiz'),
  toggleFull: $('toggleFull'),
  scoreText: $('scoreText'), accuracyText: $('accuracyText'),
  playerPlaceholder: $('playerPlaceholder'), playerLoading: $('playerLoading'),
  toasts: $('toasts'), dialogToasts: $('dialogToasts'),
};

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const state = {
  videoId: null,
  generatedVideoId: null,
  duration: 0,
  synced: true,
  lines: [],
  questions: [],
  answers: {},
  selectedCount: null,
  selectedDifficulty: null,
  eligible: null,
  fullMode: false,
  isPlaying: false,
  isBuffering: false,
  videoLoading: false,
  activeIdx: -1,
  activeQid: null,
};

let autoLyricsVideoId = null;
let lyricSource = null;

function setLyricSourceIcon() {
  els.lyricSourceIcon.innerHTML =
    lyricSource === 'youtube' ? icons.youtube :
    lyricSource === 'lrclib' ? icons.pustaka : '';
}
let lineEls = [];
const quizCards = new Map();
const lineToQ = new Map();
const questionsById = new Map();

function indexQuestions() {
  lineToQ.clear();
  questionsById.clear();
  for (const q of state.questions) {
    questionsById.set(q.id, q);
    for (const id of q.lineIds) lineToQ.set(id, q);
  }
}

function toast(msg, type = 'info', ms = 3500) {
  const color =
    type === 'error'
      ? 'bg-[#ff5e5e]'
      : type === 'ok'
        ? 'bg-[#a6fa50]'
        : 'bg-[#ffe600]';
  const textColor = 'text-black';
  const div = h(
    'div',
    `${color} ${textColor} text-sm px-4 py-2 font-bold border-2 border-black shadow-[4px_4px_0_0_#000]`,
    msg
  );
  (els.sidebar.open ? els.dialogToasts : els.toasts).appendChild(div);
  setTimeout(() => div.remove(), ms);
}
const STATUS_COLOR = {
  idle: 'text-gray-600',
  ok: 'text-green-700',
  warn: 'text-orange-700',
  error: 'text-red-700'
};
function setStatus(el, msg, kind = 'idle') {
  el.textContent = msg;
  el.className = `text-xs font-bold mt-2 ${STATUS_COLOR[kind]}`;
}

function createFollower(container, button, getTarget) {
  let paused = false;
  let timer = 0;

  const scrollToEl = (el) => {
    if (!el) return;
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const top = container.scrollTop + (r.top - c.top) - (c.height - r.height) / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: SCROLL_BEHAVIOR });
  };
  const resume = () => {
    paused = false;
    clearTimeout(timer);
    button.classList.add('hidden');
  };
  const pause = () => {
    paused = true;
    button.classList.remove('hidden');
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!state.isPlaying) return;
      resume();
      scrollToEl(getTarget());
    }, AUTO_RESUME_MS);
  };

  container.addEventListener('wheel', pause, { passive: true });
  container.addEventListener('touchmove', pause, { passive: true });
  container.addEventListener('pointerdown', (e) => {
    if (e.target === container) pause();
  });
  button.addEventListener('click', () => {
    const target = getTarget();
    if (!target) {
      toast('Putar lagu terlebih dahulu untuk mengikuti lirik.', 'info', 2500);
      return;
    }

    resume();
    scrollToEl(target);
  });

  return {
    follow: (el) => !paused && state.isPlaying && scrollToEl(el),
    resume
  };
}

const lyricsFollower = createFollower(els.lyrics, els.followLyrics, () => lineEls[state.activeIdx]);
const quizFollower = createFollower(els.quiz, els.followQuiz, () => quizCards.get(state.activeQid));

let player = null;
let playerReady = false;
let playerInit = null;
let loadedVideoId = null;

const ytApiReady = new Promise((resolve, reject) => {
  window.onYouTubeIframeAPIReady = resolve;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = () => reject(new AppError(ERR.YT_API_FAILED, { code: 'YT_API' }));
  document.head.appendChild(tag);
});
ytApiReady.catch(() => {});

function createPlayer(videoId) {
  return new Promise((resolve) => {
    player = new YT.Player('player', {
      width: '100%',
      height: '100%',
      videoId,
      playerVars: {
        controls: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        fs: 0,
        ...(location.protocol.startsWith('http') ? { origin: window.location.origin } : {}),
      },
      events: {
        onReady: () => {
          playerReady = true;
          els.playerPlaceholder.classList.add('hidden');
          player.getIframe().className = 'absolute inset-0 w-full h-full';
          setVideoLoading(false);
          resolve();
        },
        onStateChange: (e) => {
          const S = YT.PlayerState;
          state.isPlaying = e.data === S.PLAYING;
          state.isBuffering = e.data === S.BUFFERING;
          if (e.data === S.CUED || e.data === S.PLAYING || e.data === S.PAUSED) setVideoLoading(false);
          updatePlayButton();
          syncDuration();

          if (state.isPlaying) {
            lyricsFollower.resume();
            quizFollower.resume();
          }
        },
        onError: (e) => {
          setVideoLoading(false);
          toast(YT_ERRORS[e.data] || `Player error (${e.data}).`, 'error', 6000);
        },
      },
    });
  });
}

function setVideoLoading(on) {
  state.videoLoading = on;
  els.playerLoading.classList.toggle('hidden', !on);
  updatePlayButton();
}

async function loadVideo(videoId) {
  setVideoLoading(true);
  try {
    await ytApiReady;
  } catch {
    setVideoLoading(false);
    toast(ERR.YT_API_FAILED, 'error', 6000);
    return;
  }
  if (player && loadedVideoId === videoId) {
    setVideoLoading(false);
    return;
  }
  state.duration = 0;
  loadedVideoId = videoId;
  if (!player) {
    playerInit = createPlayer(videoId);
    await playerInit;
    return;
  }
  await playerInit;
  player.cueVideoById(videoId);
}

function syncDuration() {
  if (!playerReady) return;
  const d = player.getDuration?.() || 0;
  if (!d || d === state.duration) return;
  state.duration = d;

  if (!state.synced && state.lines.length) {
    distributeEvenly(state.lines, d);
    renderQuiz();
  }
}

function updatePlayButton() {
  const waiting = state.isBuffering || state.videoLoading;
  els.playBtn.setAttribute('aria-busy', String(waiting));
  els.playIcon.className = waiting ? 'spinner' : '';
  els.playIcon.textContent = waiting ? '' : state.isPlaying ? '⏸' : '▶';
  els.playText.textContent = waiting ? 'Memuat' : state.isPlaying ? 'Pause' : 'Play';
}

els.playBtn.addEventListener('click', () => {
  if (!playerReady) return toast(state.videoLoading ? 'Video masih dimuat…' : 'Generate soal terlebih dahulu.');
  if (state.isPlaying) player.pauseVideo();
  else player.playVideo();
});

let dragging = false;
const pctFromEvent = (e) => {
  const r = els.progress.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
};

function updateProgress(cur) {
  const d = state.duration;
  const pct = d ? Math.min(100, (cur / d) * 100) : 0;
  els.progressBar.style.width = pct + '%';
  els.progress.setAttribute('aria-valuenow', String(Math.round(pct)));
  els.time.textContent = `${fmt(cur)} / ${fmt(d)}`;
}

els.progress.addEventListener('pointerdown', (e) => {
  if (!playerReady || !state.duration) return;
  dragging = true;
  els.progress.setPointerCapture(e.pointerId);
  updateProgress(pctFromEvent(e) * state.duration);
});
els.progress.addEventListener('pointermove', (e) => {
  if (dragging) updateProgress(pctFromEvent(e) * state.duration);
});
els.progress.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  player.seekTo(pctFromEvent(e) * state.duration, true);
});
els.progress.addEventListener('pointercancel', () => (dragging = false));
els.progress.addEventListener('keydown', (e) => {
  if (!playerReady || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  e.preventDefault();
  const cur = player.getCurrentTime() || 0;
  player.seekTo(Math.max(0, cur + (e.key === 'ArrowRight' ? 5 : -5)), true);
});

function findActiveIndex(t) {
  let lo = 0;
  let hi = state.lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (state.lines[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function computeActiveQid(idx) {
  if (!state.questions.length) return null;
  let next = null;
  let nextLine = Infinity;
  let last = null;
  let lastLine = -1;
  for (const q of state.questions) {
    for (const id of q.lineIds) {
      if (id >= idx && id < nextLine) {
        next = q;
        nextLine = id;
      }
      if (id > lastLine) {
        last = q;
        lastLine = id;
      }
    }
  }
  return (next || last).id;
}

function setActiveLine(idx, { scroll = true } = {}) {
  lineEls[state.activeIdx]?.classList.remove('active');
  state.activeIdx = idx;
  const el = lineEls[idx];
  el?.classList.add('active');
  if (scroll) lyricsFollower.follow(el);

  const qid = computeActiveQid(idx);
  if (qid !== state.activeQid) setActiveQuestion(qid, scroll);
}

function setActiveQuestion(qid, scroll = true) {
  quizCards.get(state.activeQid)?.classList.remove('q-active');
  state.activeQid = qid;
  const card = quizCards.get(qid);
  card?.classList.add('q-active');
  if (scroll) quizFollower.follow(card);
}

setInterval(() => {
  if (!playerReady) return;
  syncDuration();
  const cur = player.getCurrentTime?.() || 0;
  if (!dragging) updateProgress(cur);
  if (!state.lines.length) return;
  const idx = findActiveIndex(cur);
  if (idx !== state.activeIdx) setActiveLine(idx);
}, 50);

function placeholder(icon, title, sub) {
  const box = h('div', 'text-center text-gray-600 py-20');

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'text-4xl mb-3 flex justify-center';
  iconWrapper.innerHTML = icon;

  const titleEl = document.createElement('p');
  titleEl.className = 'font-bold text-black flex items-center justify-center gap-1';
  titleEl.innerHTML = title;

  box.append(iconWrapper, titleEl);

  if (sub) {
    box.append(h('p', 'text-sm mt-2 font-medium text-gray-600', sub));
  }

  return box;
}

function makeCloze(q, answerText) {
  const span = h('span', 'cloze');
  span.dataset.q = q.id;
  span.dataset.answer = answerText;
  if (q.type === 'word') span.style.minWidth = `${Math.min(Math.max(answerText.length, 3), 30)}ch`;
  else span.classList.add('cloze-line');
  return span;
}

function fillClozeLine(div, line, q) {
  if (q.type === 'line') {
    div.appendChild(makeCloze(q, line.text));
    return;
  }
  const loc = locateWord(line.text, q);
  if (!loc) {
    div.textContent = line.text;
    return;
  }
  loc.tokens.forEach((tok, i) => {
    if (i) div.append(' ');
    if (i === loc.index) {
      if (loc.prefix) div.append(loc.prefix);
      div.appendChild(makeCloze(q, loc.core));
      if (loc.suffix) div.append(loc.suffix);
    } else div.append(tok);
  });
}

function renderLyrics() {
  els.lyrics.textContent = '';
  lineEls = [];
  els.lyrics.dataset.mode = state.fullMode ? 'full' : 'cloze';

  if (!state.lines.length) {
    els.lyrics.appendChild(placeholder(icons.musik, `Klik ikon ${icons.pengaturan} untuk memulai`));
    return;
  }

  const frag = document.createDocumentFragment();
  for (const line of state.lines) {
    const div = h('div', 'lyric-line');
    div.dataset.i = line.id;
    const q = lineToQ.get(line.id);
    if (q) fillClozeLine(div, line, q);
    else div.textContent = line.text;
    frag.appendChild(div);
    lineEls[line.id] = div;
  }
  els.lyrics.appendChild(frag);

  for (const q of state.questions) if (state.answers[q.id]) revealCloze(q.id);
}

function revealCloze(qid) {
  const a = state.answers[qid];
  if (!a) return;
  els.lyrics.querySelectorAll(`.cloze[data-q="${qid}"]`).forEach((s) => {
    s.classList.add('revealed', a.correct ? 'ok' : 'bad');
  });
}

els.lyrics.addEventListener('click', (e) => {
  const el = e.target.closest('.lyric-line');
  if (!el || !playerReady) return;
  const line = state.lines[Number(el.dataset.i)];
  if (!line) return;
  player.seekTo(line.time, true);
});

els.toggleFull.addEventListener('change', () => {
  state.fullMode = els.toggleFull.checked;
  els.lyrics.dataset.mode = state.fullMode ? 'full' : 'cloze';
  saveSession();
});

function appendMaskedLine(el, q, line, revealed) {
  const loc = locateWord(line.text, q);
  if (!loc) {
    el.textContent = '______';
    return;
  }
  loc.tokens.forEach((tok, i) => {
    if (i) el.append(' ');
    if (i !== loc.index) {
      return el.append(tok);
    }
    if (loc.prefix) {
      el.append(loc.prefix);
    }
    el.appendChild(
      revealed
        ? h(
            'span',
            'font-black text-black bg-[#a6fa50] border-2 border-black px-1',
            loc.core
          )
        : h(
            'span',
            'font-black text-black bg-[#ffe600] border-b-4 border-black px-1',
            '______'
          )
    );
    if (loc.suffix) {
      el.append(loc.suffix);
    }
  });
}

function buildCard(card, q, index) {
  card.textContent = '';
  card.className = 'q-card' + (q.id === state.activeQid ? ' q-active' : '');
  const ans = state.answers[q.id];
  const line = state.lines[q.lineIds[0]];
  const head = h('div', 'flex justify-between items-start mb-3 gap-3');
  const left = h('div', 'flex items-center gap-2');
  left.append(
    h(
      'span',
      'bg-[#ffe600] text-black text-xs font-black w-7 h-7 border-2 border-black shadow-[2px_2px_0_0_#000] flex items-center justify-center shrink-0',
      String(index + 1)
    ),
    h('span', 'text-xs text-gray-600 font-bold tabular-nums', `[${fmt(line.time)}]`)
  );
  head.appendChild(left);
  if (ans) {
    head.appendChild(
      h(
        'span',
        'text-xs px-2 py-1 font-black border-2 border-black shadow-[2px_2px_0_0_#000] shrink-0 ' +
          (ans.correct ? 'bg-[#a6fa50] text-black' : 'bg-[#ff5e5e] text-black'),
        ans.correct ? '✓ Benar' : '✗ Salah'
      )
    );
  }
  card.appendChild(head);
  const prompt = h('p', 'text-black font-bold mb-3');
  if (q.type === 'word') {
    appendMaskedLine(prompt, q, line, !!ans);
  } else {
    const prev = state.lines[q.lineIds[0] - 1];
    if (prev && !lineToQ.has(prev.id)) {
      prompt.appendChild(
        h('span', 'block text-black-600 italic font-medium', `… ${prev.text}`)
      );
    }
    prompt.appendChild(
      ans
        ? h(
            'span',
            'block mt-1 font-black text-black bg-[#a6fa50] border-l-4 border-black px-2 py-1',
            line.text
          )
        : h(
            'span',
            'block mt-1 font-black text-black bg-[#ffe600] border-l-4 border-black px-2 py-1',
            'Lanjutan lirik: ______'
          )
    );
  }
  card.appendChild(prompt);
  const list = h('div', 'space-y-3');
  for (const opt of q.options) {
    const btn = h('button', 'option-btn w-full text-left px-3 py-2 flex items-start gap-3');
    btn.type = 'button';
    btn.append(
      h('span', 'opt-key font-black text-black shrink-0', `${opt.key}.`),
      h('span', 'flex-1 text-black', opt.text)
    );
    if (ans) {
      btn.disabled = true;
      if (opt.key === q.correctKey) {
        btn.dataset.state = 'correct';
        btn.append(h('span', 'shrink-0 font-black text-black', '✓'));
      } else if (opt.key === ans.picked) {
        btn.dataset.state = 'wrong';
        btn.append(h('span', 'shrink-0 font-black text-black', '✗'));
      } else {
        btn.dataset.state = 'dim';
      }
    } else {
      btn.addEventListener('click', () => answer(q.id, opt.key));
    }
    list.appendChild(btn);
  }
  card.appendChild(list);
}

function renderQuiz() {
  els.quiz.textContent = '';
  quizCards.clear();
  if (!state.questions.length) {
    els.quiz.appendChild(placeholder(icons.buku, 'Soal akan muncul di sini'));
    return;
  }
  const frag = document.createDocumentFragment();
  state.questions.forEach((q, i) => {
    const card = document.createElement('article');
    card.dataset.q = q.id;
    quizCards.set(q.id, card);
    buildCard(card, q, i);
    frag.appendChild(card);
  });
  els.quiz.appendChild(frag);
}

function answer(qid, key) {
  const q = questionsById.get(qid);
  if (!q || state.answers[qid]) return;
  state.answers[qid] = { picked: key, correct: key === q.correctKey };

  buildCard(quizCards.get(qid), q, state.questions.indexOf(q));
  revealCloze(qid);
  updateScore();
  saveSession();

  const total = state.questions.length;
  if (Object.keys(state.answers).length === total) {
    const ok = Object.values(state.answers).filter((a) => a.correct).length;
    toast(`Selesai! Skor ${ok}/${total} (${Math.round((ok / total) * 100)}%)`, 'ok', 6000);
  }
}

function updateScore() {
  const total = state.questions.length;
  const list = Object.values(state.answers);
  const ok = list.filter((a) => a.correct).length;
  els.scoreText.textContent = `${list.length} / ${total}`;
  if (list.length) {
    const acc = Math.round((ok / list.length) * 100);
    els.accuracyText.textContent = acc + '%';
    els.accuracyText.className =
      'font-black ' +
      (acc >= 70
        ? 'text-green-700'
        : acc >= 40
          ? 'text-orange-700'
          : 'text-red-700');
  } else {
    els.accuracyText.textContent = '-';
    els.accuracyText.className = 'font-black text-black';
  }
}

function renderAll() {
  indexQuestions();
  state.activeIdx = -1;
  state.activeQid = null;
  renderLyrics();
  renderQuiz();
  updateScore();
  setActiveLine(-1, { scroll: false });
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || els.sidebar.open) return;
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const key = { a: 'A', b: 'B', c: 'C', 1: 'A', 2: 'B', 3: 'C' }[e.key.toLowerCase()];
  if (key && state.activeQid) answer(state.activeQid, key);
});

els.sidebarBtn.addEventListener('click', () => {
  els.sidebar.showModal();
  document.body.classList.add('overflow-hidden');
});
els.closeSidebar.addEventListener('click', () => els.sidebar.close());
els.sidebar.addEventListener('click', (e) => {
  if (e.target === els.sidebar) els.sidebar.close();
});
els.sidebar.addEventListener('close', () => document.body.classList.remove('overflow-hidden'));

function styleChoice(b, selected, disabled = false) {
  b.setAttribute('aria-pressed', String(selected));
  b.className =
    'min-h-10 px-3 border-2 border-black text-sm font-black transition-all ' +
    'shadow-[3px_3px_0_0_#000] ' +
    (selected
      ? 'bg-[#ffe600] text-black translate-x-[2px] translate-y-[2px] shadow-[1px_1px_0_0_#000]'
      : 'bg-white text-black hover:bg-[#00d062]') +
    (disabled ? ' opacity-30 cursor-not-allowed' : '');
}

function setInvalid(group, errorEl, message = '') {
  group.classList.toggle('invalid-group', !!message);
  errorEl.textContent = message;
  errorEl.classList.toggle('hidden', !message);
}

function buildCountButtons() {
  for (const c of COUNTS) {
    const b = h('button', '', String(c));
    b.type = 'button';
    b.dataset.count = String(c);
    b.addEventListener('click', () => {
      if (b.disabled) return;
      state.selectedCount = c;
      setInvalid(els.counts, els.countError);
      updateCountButtons();
      saveSession();
    });
    els.counts.appendChild(b);
  }
}

function updateCountButtons() {
  const max = state.eligible == null ? COUNTS[COUNTS.length - 1] : Math.max(COUNTS[0], state.eligible);
  if (state.selectedCount !== null && state.selectedCount > max) {
    state.selectedCount = [...COUNTS].reverse().find((c) => c <= max) || COUNTS[0];
  }
  for (const b of els.counts.children) {
    const c = Number(b.dataset.count);
    b.disabled = c > max;
    styleChoice(b, c === state.selectedCount, b.disabled);
  }
}

function buildDifficultyButtons() {
  for (const d of DIFFICULTIES) {
    const b = h('button', '', String(d));
    b.type = 'button';
    b.dataset.level = String(d);
    b.addEventListener('click', () => {
      state.selectedDifficulty = d;
      setInvalid(els.difficulty, els.difficultyError);
      updateDifficultyButtons();
      saveSession();
    });
    els.difficulty.appendChild(b);
  }
}

function updateDifficultyButtons() {
  for (const b of els.difficulty.children) {
    styleChoice(b, Number(b.dataset.level) === state.selectedDifficulty);
  }
}

function onYtInput() {
  const v = els.ytLink.value.trim();
  if (!v) {
    state.videoId = null;
    return setStatus(els.ytStatus, 'Belum ada video');
  }
  state.videoId = extractVideoId(v);
  if (state.videoId) setStatus(els.ytStatus, '✓ Video ID: ' + state.videoId, 'ok');
  else setStatus(els.ytStatus, 'Link YouTube tidak valid', 'error');
}
els.ytLink.addEventListener('input', () => {
  onYtInput();
  saveSession();
});

let lyricTimer = 0;
els.lyricInput.addEventListener('input', () => {
  autoLyricsVideoId = null;
  lyricSource = null;
  state.eligible = null;
  setLyricSourceIcon();
  clearTimeout(lyricTimer);
  lyricTimer = setTimeout(() => {
    refreshLyricStatus();
    saveSession();
  }, 200);
});

function refreshLyricStatus() {
  if (!els.lyricInput.value.trim()) {
    state.eligible = null;
    setStatus(els.lyricStatus, 'Belum ada lirik');
  } else if (state.eligible != null && state.lines.length) {
    setStatus(
      els.lyricStatus,
      `✓ ${state.lines.length} baris · ${state.eligible} layak dijadikan soal` +
        (state.synced ? '' : ' · tanpa timestamp: waktu dibagi rata, sinkron tidak presisi'),
      state.synced ? 'ok' : 'warn'
    );
  } else {
    setStatus(els.lyricStatus, 'Lirik terisi. Akan diproses saat Generate.');
  }
  updateCountButtons();
}

function setBusy(on) {
  els.generateBtn.disabled = on;
  els.resetBtn.disabled = on;
  els.generateBtn.setAttribute('aria-busy', String(on));
  els.genSpinner.classList.toggle('hidden', !on);
}

async function waitForDuration(videoId, timeoutMs = 5000) {
  if (!playerReady) return 0;

  const end = performance.now() + timeoutMs;

  while (performance.now() < end) {
    const loaded = player.getVideoData?.()?.video_id;
    const d = player.getDuration?.() || 0;

    if (d > 0 && (!loaded || loaded === videoId)) return d;

    await new Promise((r) => setTimeout(r, 100));
  }

  return 0;
}

async function postBuild(payload) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new AppError(ERR.NETWORK, { cause: e, code: 'NETWORK' });
  }

  let data = null;
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    const msg =
      res.status === 429
        ? 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.'
        : typeof data?.detail === 'string'
          ? data.detail
          : ERR.BACKEND_HTTP(res.status);
    throw new AppError(msg, { code: 'HTTP_' + res.status });
  }

  if (!data || !Array.isArray(data.lines) || !Array.isArray(data.questions)) {
    throw new AppError(ERR.BACKEND_INVALID, { code: 'INVALID_JSON' });
  }
  return data;
}

async function onGenerate() {
  if (!state.videoId) {
    els.ytLink.focus();
    return toast('Masukkan link YouTube yang valid dulu.', 'error');
  }

  const noCount = state.selectedCount === null;
  const noLevel = state.selectedDifficulty === null;
  setInvalid(els.counts, els.countError, noCount ? 'Pilih jumlah soal dulu.' : '');
  setInvalid(els.difficulty, els.difficultyError, noLevel ? 'Pilih tingkat kesulitan dulu.' : '');
  if (noCount || noLevel) {
    (noCount ? els.counts : els.difficulty).scrollIntoView({ block: 'center', behavior: SCROLL_BEHAVIOR });
    return toast('Lengkapi pilihan yang ditandai merah dulu.', 'error');
  }

  const videoId = state.videoId;
  try {
    setBusy(true);

    if (autoLyricsVideoId !== null && autoLyricsVideoId !== videoId) {
      els.lyricInput.value = '';
      autoLyricsVideoId = null;
    }

    const lyricText = els.lyricInput.value.trim();

    let duration = 0;
    if (!lyricText) {
      await loadVideo(videoId);
      duration = await waitForDuration(videoId);
    }

    const data = await postBuild({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      lyricText,
      count: state.selectedCount,
      difficulty: state.selectedDifficulty,
      seed: (Math.random() * 2 ** 32) >>> 0,
      duration,
    });

    if (data.lyricText) {
      els.lyricInput.value = data.lyricText;
      autoLyricsVideoId = videoId;
      lyricSource = data.source === 'lrclib' ? 'lrclib' : 'youtube';
      setLyricSourceIcon();
    }

    if (videoId !== loadedVideoId) state.duration = 0;
    state.generatedVideoId = videoId;
    state.synced = data.synced;
    state.lines = data.lines;
    state.questions = data.questions;
    state.answers = {};
    state.eligible = data.eligible;
    if (!data.synced) distributeEvenly(state.lines, state.duration);

    refreshLyricStatus();
    renderAll();
    saveSession();

    await loadVideo(videoId);
    els.sidebar.close();

    if (data.source === 'lrclib' && data.meta && !data.meta.exact) {
      const gap =
        data.meta.lrcDuration && duration
          ? ` (lirik ${fmt(data.meta.lrcDuration)} vs video ${fmt(duration)})`
          : '';
      toast(`Lirik ditemukan di LRCLIB, tapi versi/durasi tidak persis${gap}. Kalau kurang pas, paste lirik manual.`, 'info', 8000);
    } else if (data.lyricText) {
      toast('Lirik berhasil ditemukan otomatis.', 'ok', 3000);
    }

    const n = data.questions.length;
    toast(
      n < state.selectedCount
        ? `${n} soal dibuat (baris layak soal hanya segitu). Tekan ▶ Play.`
        : `${n} soal siap. Tekan ▶ Play untuk mulai.`,
      'ok'
    );
  } catch (err) {
    toast(err.message || ERR.GENERATE_FAILED, 'error', 5000);
  } finally {
    setBusy(false);
  }
}

function onReset() {
  clearTimeout(saveTimer);

  try {
    localStorage.removeItem(STORE_KEY);
  } catch {}

  els.ytLink.value = '';
  els.lyricInput.value = '';

  state.videoId = null;
  state.generatedVideoId = null;
  state.duration = 0;
  state.synced = true;
  state.lines = [];
  state.questions = [];
  state.answers = {};
  state.selectedCount = null;
  state.selectedDifficulty = null;
  state.eligible = null;
  state.fullMode = false;
  state.isPlaying = false;
  state.isBuffering = false;
  state.videoLoading = false;
  state.activeIdx = -1;
  state.activeQid = null;

  autoLyricsVideoId = null;
  lyricSource = null;
  setLyricSourceIcon();
  loadedVideoId = null;
  lineEls = [];

  lineToQ.clear();
  questionsById.clear();
  quizCards.clear();

  if (playerReady && player) {
    try {
      player.stopVideo();
      const iframe = player.getIframe?.();
      if (iframe) {
        iframe.className = 'absolute inset-0 w-full h-full hidden';
      }
    } catch (err) {}
  }

  els.playerPlaceholder.classList.remove('hidden');

  setVideoLoading(false);
  updatePlayButton();
  updateProgress(0);

  els.toggleFull.checked = false;

  setStatus(els.ytStatus, 'Belum ada video');
  setStatus(els.lyricStatus, 'Belum ada lirik');

  setInvalid(els.counts, els.countError);
  setInvalid(els.difficulty, els.difficultyError);
  updateCountButtons();
  updateDifficultyButtons();

  renderAll();

  els.lyrics.scrollTop = 0;
  els.quiz.scrollTop = 0;

  toast('Semua data berhasil direset.', 'ok');
}

els.generateBtn.addEventListener('click', onGenerate);
els.resetBtn.addEventListener('click', onReset);

let saveTimer = 0;
function saveSession() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          v: 2,
          ytLink: els.ytLink.value,
          lyricText: els.lyricInput.value,
          autoLyricsVideoId,
          lyricSource,
          fullMode: state.fullMode,
          selectedCount: state.selectedCount,
          selectedDifficulty: state.selectedDifficulty,
          eligible: state.eligible,
          generatedVideoId: state.generatedVideoId,
          synced: state.synced,
          lines: state.lines,
          questions: state.questions,
          answers: state.answers,
        })
      );
    } catch {}
  }, 200);
}

function restoreSession() {
  let s;
  try {
    s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  } catch {
    return;
  }
  if (!s || s.v !== 2) return;

  els.ytLink.value = s.ytLink || '';
  onYtInput();
  els.lyricInput.value = s.lyricText || '';

  autoLyricsVideoId = s.autoLyricsVideoId || null;
  lyricSource = s.lyricSource || null;
  setLyricSourceIcon();
  state.fullMode = !!s.fullMode;
  els.toggleFull.checked = state.fullMode;

  state.selectedCount = s.selectedCount ?? null;
  state.selectedDifficulty = s.selectedDifficulty ?? null;
  state.eligible = Number.isInteger(s.eligible) ? s.eligible : null;

  if (
    s.generatedVideoId &&
    Array.isArray(s.lines) && s.lines.length &&
    Array.isArray(s.questions) && s.questions.length &&
    s.questions.every((q) => q.lineIds?.every((id) => id >= 0 && id < s.lines.length))
  ) {
    state.generatedVideoId = s.generatedVideoId;
    state.synced = !!s.synced;
    state.lines = s.lines;
    state.questions = s.questions;
    state.answers = s.answers && typeof s.answers === 'object' ? s.answers : {};
    loadVideo(state.generatedVideoId).catch(() => {});
  } else {
    state.eligible = null;
  }

  refreshLyricStatus();
}

buildCountButtons();
buildDifficultyButtons();
restoreSession();
updateCountButtons();
updateDifficultyButtons();
updateProgress(0);
renderAll();

const HEALTH_TIMEOUT_MS = 5000;
let checkingServer = false;

async function pingServer() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/healthz`, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function checkServer() {
  if (checkingServer) return;
  checkingServer = true;
  try {
    const online = await pingServer();
    toast(online ? 'SERVER ONLINE' : 'SERVER OFFLINE', online ? 'ok' : 'error', 2500);
  } finally {
    checkingServer = false;
  }
}

const brandEl = $('brandStatus');
if (brandEl) {
  brandEl.addEventListener('click', checkServer);
  brandEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      checkServer();
    }
  });
}

function cleanYouTubeUrl(raw) {
  const s = raw.trim();
  const id = extractVideoId(s);
  if (!id || s === id) return s;
  return /youtu\.be/i.test(s)
    ? `https://youtu.be/${id}`
    : `https://www.youtube.com/watch?v=${id}`;
}

els.ytLink.addEventListener('paste', (e) => {
  const pasted = e.clipboardData?.getData('text');
  if (!pasted) return;
  const cleaned = cleanYouTubeUrl(pasted);
  if (cleaned === pasted.trim()) return;
  e.preventDefault();
  els.ytLink.value = cleaned;
  onYtInput();
  saveSession();
});

checkServer();