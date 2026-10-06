import { icons } from '../icons/icon.js';

export const modalHTML = `
  <dialog id="welcomeModal" class="group m-0 p-4 max-w-none max-h-none w-screen h-screen bg-black/60 backdrop-blur- fixed inset-0 z-9999 hidden open:grid place-items-center open:animate-[fadeIn_0.2s_ease] backdrop:bg-black/60">
    <div class="w-full max-w- bg-white rounded- shadow-2xl p-6 text-center animate-[scaleIn_0.25s_ease]">
      <div class="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 text-amber-500 grid place-items-center [&_svg]:w-7 [&_svg]:h-7">
        ${icons.saran}
      </div>
      <h2 class="text- font-bold leading-tight text-zinc-900 mb-2">
        Disarankan untuk menggunakan laptop!
      </h2>
      <p class="text- leading-relaxed text-zinc-500 mb-5">
        Pengalaman terbaik akan kamu dapatkan saat membuka halaman ini di laptop atau desktop.
      </p>
      <button id="welcomeModalClose" type="button" class="w-full h-11 rounded-full bg-zinc-900 text-white text- font-semibold hover:bg-emerald-600 active:scale-[0.98] transition-all">
        Gapapa, lanjut di hp aja!
      </button>
    </div>
  </dialog>
`;

const MOBILE_QUERY = '(max-width: 768px)';

export function initWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  const closeBtn = document.getElementById('welcomeModalClose');

  if (!modal) return;

  modal.addEventListener('cancel', (e) => {
    e.preventDefault();
  });

  const mql = window.matchMedia(MOBILE_QUERY);

  const openModal = () => {
    if (!modal.open) {
      if (typeof modal.showModal === 'function') {
        modal.showModal();
      } else {
        modal.setAttribute('open', '');
      }
    }
  };

  const closeModal = () => {
    if (modal.open) {
      modal.close();
    } else {
      modal.removeAttribute('open');
    }
  };

  if (mql.matches) {
    openModal();
  }

  const handleChange = (e) => {
    if (e.matches) {
      openModal();
    } else {
      closeModal();
    }
  };

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handleChange);
  } else if (typeof mql.addListener === 'function') {
    mql.addListener(handleChange);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.close();
    });
  }
}