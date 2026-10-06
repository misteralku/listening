import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import re
import random
import traceback
from pathlib import Path
from typing import Optional
from urllib.parse import parse_qs, urlparse

import requests
from fastapi.responses import HTMLResponse
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from youtube_transcript_api import YouTubeTranscriptApi

import spacy
import pronouncing
from wordfreq import top_n_list, zipf_frequency

try:
    from lemminflect import getInflection
    HAS_LEMMINFLECT = True
except ImportError:
    HAS_LEMMINFLECT = False

class Settings(BaseSettings):
    port: int = 3000
    min_zipf: float = 2.2
    debug: bool = False
    allowed_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env.example", extra="ignore")

settings = Settings()
MIN_ZIPF = settings.min_zipf
BASE_DIR = Path(__file__).parent

def _origin(url: str) -> str:
    p = urlparse(url.strip())
    return f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else ""

ORIGINS = sorted(
    # {"http://127.0.0.1:3000", "http://localhost:3000"}
    | {o for o in map(_origin, settings.allowed_origins.split(",")) if o}
)

app = FastAPI(
    title="Lirik App",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    root_path="/api",
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

nlp = spacy.load("en_core_web_lg")

ID_RE = re.compile(r"^[\w-]{11}$")

def get_video_id(value: str) -> Optional[str]:
    s = (value or "").strip()
    if not s:
        return None
    if ID_RE.match(s):
        return s
    u = urlparse(s if re.match(r"^https?://", s, re.I) else "https://" + s)
    host = re.sub(r"^(www|m|music)\.", "", (u.hostname or "").lower())
    vid = None
    if host == "youtu.be":
        vid = u.path.lstrip("/").split("/")[0]
    elif host in ("youtube.com", "youtube-nocookie.com"):
        if u.path == "/watch":
            vid = (parse_qs(u.query).get("v") or [None])[0]
        else:
            m = re.match(r"^/(?:embed|shorts|live|v)/([\w-]{11})", u.path)
            vid = m.group(1) if m else None
    return vid if vid and ID_RE.match(vid) else None

def get_youtube_title(video_id: str) -> str:
    try:
        r = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
            timeout=10,
        )
        if r.status_code == 200:
            return r.json().get("title", "")
    except Exception as e:
        if settings.debug:
            print(f"Gagal ambil title: {e}", flush=True)
    return ""

TIME_TAG = re.compile(r"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
OFFSET_TAG = re.compile(r"^\[offset:\s*([+-]?\d+)\s*\]$", re.I)
LEADING_TAGS = re.compile(r"^((?:\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+)\s*(.*)$")
META_TAG = re.compile(r"^\[[a-z]{2,8}:[^\]]*\]$", re.I)
WORD_TAG = re.compile(r"<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>")
SECTION_TAG = re.compile(r"^\[[^\]]*\]$")

def normalize_text(raw) -> str:
    s = str(raw or "")
    s = re.sub(r"[\u200B-\u200D\u2060\uFEFF]", "", s)
    s = re.sub(r"[\u00A0\u2007\u202F]", " ", s)
    s = re.sub(r"[\u2018\u2019\u02BC]", "'", s)
    s = re.sub(r"[\u201C\u201D]", '"', s)
    s = re.sub(r"\r\n?", "\n", s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

def _to_seconds(mm, ss, frac) -> float:
    return float(mm) * 60 + float(ss) + (float("0." + frac) if frac else 0.0)

def _clean_text(s: str) -> str:
    t = re.sub(r"\s+", " ", WORD_TAG.sub("", s)).strip()
    return "" if SECTION_TAG.match(t) else t

def parse_lrc(text: str):
    timed, untimed, offset_ms = [], [], 0

    for raw in normalize_text(text).split("\n"):
        line = raw.strip()
        if not line:
            continue
        om = OFFSET_TAG.match(line)
        if om:
            offset_ms = int(om.group(1))
            continue
        if META_TAG.match(line):
            continue
        m = LEADING_TAGS.match(line)
        if m:
            content = _clean_text(m.group(2))
            if not content:
                continue
            for t in TIME_TAG.finditer(m.group(1)):
                timed.append({"time": _to_seconds(*t.groups()), "text": content})
        else:
            content = _clean_text(line)
            if content:
                untimed.append({"time": None, "text": content})

    synced = bool(timed)
    if synced:
        shift = offset_ms / 1000
        for t in timed:
            t["time"] = max(0.0, t["time"] - shift)
        timed.sort(key=lambda t: t["time"])
        source = timed
    else:
        source = untimed

    return [{"id": i, **l} for i, l in enumerate(source)], synced

def lines_to_text(lines, synced: bool) -> str:
    if not synced:
        return "\n".join(l["text"] for l in lines)
    return "\n".join(
        f"[{int(l['time'] // 60):02d}:{l['time'] % 60:05.2f}] {l['text']}" for l in lines
    )

def lines_from_youtube(video_id: str):
    if settings.debug:
        print(f"[YT] Mencoba mengambil transcript untuk video: {video_id}", flush=True)
    api = YouTubeTranscriptApi()
    try:
        transcript = api.fetch(video_id, languages=["id", "en"])
    except Exception as e1:
        if settings.debug:
            print(f"[YT] Gagal dengan filter bahasa id/en: {e1}. Mencoba default...", flush=True)
        try:
            transcript = api.fetch(video_id)
        except Exception as e2:
            if settings.debug:
                print(f"[YT] Transcript TIDAK tersedia atau gagal diambil untuk {video_id}: {e2}", flush=True)
            return None

    segs = list(transcript)
    if not segs:
        if settings.debug:
            print(f"[YT] Transcript kosong untuk {video_id}", flush=True)
        return None

    if settings.debug:
        print(f"[YT] Berhasil mengambil {len(segs)} segmen transcript.", flush=True)

    music = any("♪" in seg.text for seg in segs)
    out = []
    for seg in segs:
        text = seg.text.replace("\n", " ").strip()
        if music:
            if "♪" not in text:
                continue
            text = text.replace("♪", "").strip()
        text = normalize_text(text)
        if text:
            out.append({"time": float(seg.start), "text": text})

    result = [{"id": i, **l} for i, l in enumerate(out)] or None
    if result and settings.debug:
        print(f"[YT] Berhasil memproses {len(result)} baris lirik dari YouTube.", flush=True)
    return result

def parse_video_title(title: str):
    clean = re.sub(r"\s+", " ", re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", title)).strip()
    m = re.match(r"^(.+?)\s+[-–—]\s+([^|]+)", clean)
    if m:
        return m.group(1).strip(), m.group(2).strip(), clean
    return "", clean, clean

DURATION_TOLERANCE = 2

def lrclib_lookup(title: str, duration: float):
    artist, track, query = parse_video_title(title)

    if artist and duration:
        try:
            r = requests.get(
                "https://lrclib.net/api/get",
                params={"track_name": track, "artist_name": artist, "duration": round(duration)},
                timeout=10,
            )
            if r.ok:
                t = r.json()
                if t.get("syncedLyrics"):
                    return t, True
        except Exception as e:
            if settings.debug:
                print(f"[LRCLIB] get gagal: {e}", flush=True)

    queries = [query]
    alt = re.sub(r"official (music )?video|lyrics?|audio|\bmv\b", "", query, flags=re.I)
    alt = re.sub(r"\s+", " ", alt).strip()
    if alt and alt!= query:
        queries.append(alt)

    results = []
    for q in queries:
        try:
            r = requests.get("https://lrclib.net/api/search", params={"q": q}, timeout=15)
            results = r.json() if r.ok else []
        except Exception as e:
            if settings.debug:
                print(f"[LRCLIB] search gagal: {e}", flush=True)
            results = []
        if results:
            break

    synced = [t for t in results if t.get("syncedLyrics")]
    pool = synced or [t for t in results if t.get("plainLyrics")]
    if not pool:
        return None, False
    if not duration:
        return pool[0], False

    best = min(pool, key=lambda t: abs((t.get("duration") or 0) - duration))
    gap = abs((best.get("duration") or 0) - duration)
    return best, bool(best.get("syncedLyrics")) and gap <= DURATION_TOLERANCE

def fetch_lyrics(video_id: str, duration: float):
    lines = lines_from_youtube(video_id)
    if lines:
        if settings.debug:
            print("[YT] Menggunakan transcript dari YouTube.", flush=True)
        return lines, True, "youtube", None

    if settings.debug:
        print("[LRCLIB] Transcript YouTube tidak ditemukan/gagal, fallback ke LRCLIB...", flush=True)
    title = get_youtube_title(video_id)
    if title:
        track, exact = lrclib_lookup(title, duration)
        if track:
            lines, synced = parse_lrc(track.get("syncedLyrics") or track.get("plainLyrics") or "")
            if lines:
                meta = {
                    "title": parse_video_title(title)[2],
                    "exact": exact,
                    "lrcDuration": track.get("duration"),
                }
                if settings.debug:
                    print(f"[LRCLIB] Berhasil mendapatkan lirik dari LRCLIB (Exact: {exact}).", flush=True)
                return lines, synced, "lrclib", meta

    if settings.debug:
        print("[ERROR] Lirik tidak ditemukan di YouTube maupun LRCLIB.", flush=True)
    raise HTTPException(
        status_code=404,
        detail="Lirik tidak ditemukan otomatis. Silakan paste lirik manual.",
    )

TOKEN_RE = re.compile(r"\S+")
CORE_RE = re.compile(r"^[^\w']*(.*?)[^\w']*$", re.UNICODE)
TARGET_POS = {"VERB", "NOUN", "ADJ"}
FILLER_RE = re.compile(r"^(?:o+h*|a+h+|ye+a?h*|he+y+|uh+|huh|m+|hm+|na+|la+|da+|wo+a?h*|ay+|doo+|ha+)$")

SENTENCE_RATIO = {1: 0.0, 2: 0.15, 3: 0.3, 4: 0.45, 5: 0.6}

def _is_common(word: str) -> bool:
    return zipf_frequency(word, "en") >= MIN_ZIPF

class Phonetics:
    def __init__(self):
        pronouncing.phones_for_word("a")
        self._word_phones: dict[str, str] = {}
        self._phones_to_words: dict[tuple, set] = {}
        for word, phones in pronouncing.pronunciations:
            if "(" in word:
                continue
            self._word_phones.setdefault(word, phones)
            key = self._strip_stress(phones)
            self._phones_to_words.setdefault(key, set()).add(word)

    @staticmethod
    def _strip_stress(phones: str) -> tuple:
        return tuple(re.sub(r"\d", "", p) for p in phones.split())

    def phones(self, word: str) -> Optional[str]:
        w = word.lower()
        if w in self._word_phones:
            return self._word_phones[w]
        found = pronouncing.phones_for_word(w)
        return found[0] if found else None

    def homophones(self, word: str) -> list[str]:
        p = self.phones(word)
        if not p:
            return []
        key = self._strip_stress(p)
        return [w for w in self._phones_to_words.get(key, ()) if w!= word.lower() and _is_common(w)]

    def nearest(self, word: str, pool: list[str], k: int, same_syllables: bool) -> list[str]:
        p = self.phones(word)
        if not p:
            return []
        target_syll = pronouncing.syllable_count(p)
        base = " ".join(self._strip_stress(p))
        scored = []
        for cand in pool:
            if cand.lower() == word.lower():
                continue
            cp = self.phones(cand)
            if not cp:
                continue
            if same_syllables and pronouncing.syllable_count(cp)!= target_syll:
                continue
            dist = _levenshtein(base, " ".join(self._strip_stress(cp)))
            scored.append((dist, cand))
        scored.sort(key=lambda x: x[0])
        return [w for _, w in scored[:k]]

def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    la, lb = len(a), len(b)
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[lb]

PHON = Phonetics()

def _build_fallback_vocab(n: int = 1200) -> dict[str, list[str]]:
    words = [w for w in top_n_list("en", n) if w.isalpha() and len(w) > 2]
    vocab: dict[str, list[str]] = {"VERB": [], "NOUN": [], "ADJ": []}
    for doc in nlp.pipe(words, batch_size=200):
        if not len(doc):
            continue
        pos = doc[0].pos_
        if pos in vocab:
            vocab[pos].append(doc[0].text.lower())
    return vocab

FALLBACK_VOCAB = _build_fallback_vocab()

def grammar_variant(token) -> Optional[str]:
    if not HAS_LEMMINFLECT:
        return None
    if token.pos_ == "VERB":
        tags = ["VBD", "VBZ", "VBG", "VBP"]
    elif token.pos_ == "NOUN":
        tags = ["NNS", "NN"]
    else:
        return None
    variants = []
    for tag in tags:
        forms = getInflection(token.lemma_, tag=tag)
        if forms and forms[0].lower()!= token.text.lower():
            variants.append(forms[0])
    return random.choice(variants) if variants else None

def subject_index(doc) -> Optional[int]:
    for tok in doc:
        if tok.dep_ in ("nsubj", "nsubjpass", "expl"):
            return tok.i
    return None

def naive_tokens(text: str):
    return [{"text": m.group(), "start": m.start(), "end": m.end()} for m in TOKEN_RE.finditer(text)]

def token_core(tok: str) -> str:
    m = CORE_RE.match(tok)
    return m.group(1) if m else tok

def is_filler(core: str) -> bool:
    return all(FILLER_RE.match(p) for p in core.lower().split("-"))

def norm_key(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w' ]+", " ", text.lower())).strip()

def strip_trailing(text: str) -> str:
    return re.sub(r"[,.;:!?…]+\s*$", "", text)

def match_case(word: str, model: str) -> str:
    return word[:1].upper() + word[1:] if model[:1].isupper() else word

def word_variants(token, pool: list[str], n: int, exclude: set) -> list[str]:
    w = token.text
    seen = {w.lower()} | {x.lower() for x in exclude}
    out: list[str] = []

    def add(cands):
        for c in cands:
            if len(out) >= n:
                return
            if c.lower() not in seen:
                out.append(c)
                seen.add(c.lower())

    add(PHON.homophones(w))
    add(PHON.nearest(w, pool, k=n * 4, same_syllables=True))
    gv = grammar_variant(token)
    if gv:
        add([gv])
    add(PHON.nearest(w, pool, k=n * 4, same_syllables=False))
    add([c for c in pool if c.lower()!= w.lower()])
    return [match_case(c, w) for c in out[:n]]

def make_options(correct_text: str, distractors: list[str], rng: random.Random):
    items = [{"text": correct_text, "correct": True}] + [{"text": d, "correct": False} for d in distractors]
    rng.shuffle(items)
    labels = ["A", "B", "C"]
    options, correct_key = [], "A"
    for i, it in enumerate(items[:3]):
        options.append({"key": labels[i], "text": it["text"]})
        if it["correct"]:
            correct_key = labels[i]
    return options, correct_key

def analyze_lines(lines):
    groups: dict[str, dict] = {}
    for ln in lines:
        key = norm_key(ln["text"])
        if not key:
            continue
        if key in groups:
            groups[key]["ids"].append(ln["id"])
        else:
            groups[key] = {"rep": ln, "ids": [ln["id"]]}

    song_vocab = {"VERB": set(), "NOUN": set(), "ADJ": set()}
    analyzed = []

    for g in groups.values():
        ln = g["rep"]
        toks = naive_tokens(ln["text"])
        cores = [token_core(t["text"]) for t in toks]
        if len(toks) < 3 or all(is_filler(c) for c in cores if c):
            continue

        doc = nlp(ln["text"])
        subj = subject_index(doc)

        targets = []
        for tok in doc:
            if tok.pos_ not in TARGET_POS or tok.i == subj:
                continue
            if tok.is_stop or tok.is_punct or not tok.is_alpha or len(tok.text) <= 2:
                continue
            naive_idx = next((i for i, t in enumerate(toks) if t["start"] <= tok.idx < t["end"]), None)
            if naive_idx is None:
                continue
            answer_key = token_core(toks[naive_idx]["text"]).lower()
            if not answer_key or len(answer_key) <= 2:
                continue
            targets.append({"token": tok, "pos": tok.pos_, "answer_key": answer_key, "word_index": naive_idx})
            song_vocab[tok.pos_].add(answer_key)

        analyzed.append({
            "id": ln["id"], "ids": g["ids"], "text": ln["text"],
            "n_tokens": len(toks), "doc": doc, "subject_idx": subj, "targets": targets,
        })

    for pos in song_vocab:
        song_vocab[pos] = list(song_vocab[pos]) + FALLBACK_VOCAB[pos]
    return analyzed, song_vocab

def mutate_line(doc, subj_idx, song_vocab, used_per_pos, rng):
    content_idx = [t.i for t in doc if t.pos_ in TARGET_POS and t.i!= subj_idx and t.is_alpha and not t.is_stop]
    rng.shuffle(content_idx)

    replacements: dict[int, str] = {}
    for i in content_idx:
        tok = doc[i]
        pool = song_vocab.get(tok.pos_, [])
        exclude = used_per_pos.setdefault(i, set())
        variant = word_variants(tok, pool, n=1, exclude=exclude)
        if variant:
            replacements[i] = match_case(variant[0], tok.text)
            exclude.add(variant[0].lower())

    return "".join((replacements.get(t.i, t.text) + t.whitespace_) for t in doc)

def make_questions(lines, count: int, difficulty: int, seed: Optional[int]):
    rng = random.Random(seed) if seed is not None else random.Random()
    analyzed, song_vocab = analyze_lines(lines)

    word_eligible = [g for g in analyzed if g["targets"] and g["n_tokens"] >= 3]
    line_eligible = [g for g in analyzed if g["n_tokens"] >= 4]
    eligible = len({g["id"] for g in word_eligible} | {g["id"] for g in line_eligible})

    rng.shuffle(word_eligible)
    rng.shuffle(line_eligible)

    n_line_target = round(count * SENTENCE_RATIO.get(difficulty, SENTENCE_RATIO[3]))
    used_ids: set[int] = set()
    questions = []
    n_line = 0

    for g in line_eligible:
        if n_line >= n_line_target:
            break
        used_per_pos: dict[int, set] = {}
        variant_b = mutate_line(g["doc"], g["subject_idx"], song_vocab, used_per_pos, rng)
        variant_c = mutate_line(g["doc"], g["subject_idx"], song_vocab, used_per_pos, rng)
        if variant_b == g["text"] and variant_c == g["text"]:
            continue
        options, correct_key = make_options(
            strip_trailing(g["text"]),
            [strip_trailing(variant_b), strip_trailing(variant_c)],
            rng,
        )
        questions.append({
            "id": f"q_{g['id']}", "type": "line", "lineIds": g["ids"],
            "options": options, "correctKey": correct_key,
        })
        used_ids.add(g["id"])
        n_line += 1

    for g in word_eligible:
        if len(questions) >= count:
            break
        if g["id"] in used_ids:
            continue
        target = rng.choice(g["targets"])
        pool = [w for w in song_vocab[target["pos"]] if w!= target["answer_key"]]
        distractors = word_variants(target["token"], pool, n=2, exclude=set())
        if len(distractors) < 2:
            continue
        options, correct_key = make_options(target["token"].text, distractors, rng)
        questions.append({
            "id": f"q_{g['id']}", "type": "word", "lineIds": g["ids"],
            "wordIndex": target["word_index"], "answerKey": target["answer_key"],
            "options": options, "correctKey": correct_key,
        })
        used_ids.add(g["id"])

    questions.sort(key=lambda q: q["lineIds"][0])
    return questions[:count], eligible

class BuildReq(BaseModel):
    url: str = Field(max_length=300)
    lyricText: str = Field(default="", max_length=60000)
    count: int = Field(default=10, ge=1, le=30)
    difficulty: int = Field(default=3, ge=1, le=5)
    seed: Optional[int] = None
    duration: float = Field(default=0, ge=0, le=36000)

@app.post("/build")
@limiter.limit("20/minute")
def build(req: BuildReq, request: Request):
    try:
        video_id = get_video_id(req.url)
        if not video_id:
            raise HTTPException(status_code=400, detail="URL YouTube tidak valid.")

        source, meta, lyric_text = "manual", None, None

        if req.lyricText.strip():
            lines, synced = parse_lrc(req.lyricText)
            if not lines:
                raise HTTPException(status_code=400, detail="Lirik tidak valid atau kosong.")
        else:
            lines, synced, source, meta = fetch_lyrics(video_id, req.duration)
            lyric_text = lines_to_text(lines, synced)

        questions, eligible = make_questions(lines, req.count, req.difficulty, req.seed)
        if not questions:
            raise HTTPException(
                status_code=422,
                detail="Lirik terlalu sedikit untuk dijadikan soal (minimal 3 baris yang layak).",
            )

        return {
            "videoId": video_id,
            "source": source,
            "meta": meta,
            "synced": synced,
            "lyricText": lyric_text,
            "lines": lines,
            "questions": questions,
            "eligible": eligible,
            "requested": req.count,
        }

    except HTTPException:
        raise
    except Exception:
        if settings.debug:
            traceback.print_exc()
        raise HTTPException(status_code=500, detail="Gagal memproses di server.")

@app.get("/", response_class=HTMLResponse)
def root():
    html_path = Path(__file__).parent / "403.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"), status_code=403)
    return HTMLResponse(content="<h1>403 Forbidden</h1>", status_code=403)

@app.get("/api/healthz")
@app.get("/healthz")
def healthz():
    return {"ok": True}

application = app