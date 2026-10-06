import { icons } from '../icons/icon.js';
export const footerHTML = `
<footer class="bg-brand-blue border-t-4 border-black py-8">
  <div class="max-w-xl mx-auto px-4">
    <div id="playerWrap" class="relative aspect-video w-full bg-white border-4 border-black shadow-neo-lg overflow-hidden">
      <div id="player"></div>
      <p id="playerPlaceholder" class="absolute inset-0 flex items-center justify-center text-sm font-bold text-black text-center px-6">Video YouTube tampil di sini setelah soal digenerate</p>
      <div id="playerLoading" class="hidden absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white text-sm font-bold text-black" role="status">
        <span class="spinner spinner-lg" aria-hidden="true"></span>
        <span>Memuat video…</span>
      </div>
    </div>
  </div>
</footer>

<dialog id="sidebar" class="m-0 ml-auto h-dvh max-h-none w-full max-w-md p-0 bg-brand-bg text-black border-l-4 border-black shadow-[-8px_0_0_0_#000] backdrop:bg-black/80 backdrop:backdrop-blur-sm">
  <div class="flex flex-col h-full">
    <div class="bg-brand-pink px-6 py-4 border-b-4 border-black flex justify-between items-center shrink-0">
      <h2 class="flex items-center gap-1.5 text-2xl font-black uppercase tracking-wide">${icons.pengaturan2} Pengaturan</h2>
      <button id="closeSidebar" type="button" class="text-black hover:text-red-500 text-3xl leading-none px-2 font-bold" aria-label="Tutup">&times;</button>
    </div>

    <div class="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <label for="ytLink" class="flex items-center gap-1.5 text-sm font-black uppercase mb-2">${icons.youtube} Link YouTube</label>
        <input type="text" id="ytLink" placeholder="https://youtube.com/watch?v=..." autocomplete="off" class="w-full bg-white border-4 border-black px-3 py-2 text-sm font-bold shadow-neo-md focus:outline-none focus:shadow-neo-sm focus:translate-x-0.5 focus:translate-y-0.5 transition-all">
        <p id="ytStatus" class="text-xs font-bold text-gray-600 mt-2">Belum ada video</p>
      </div>

      <div>
        <label for="lyricInput" class="flex items-center gap-1.5 text-sm font-black uppercase mb-2">${icons.komplit} Lirik Lengkap <i class="normal-case">(opsional)</i></label>
        <textarea id="lyricInput" rows="10" spellcheck="false" placeholder="Paste lirik manual di sini jika lirik tidak otomatis tergenerate oleh sistem...&#10;&#10;Contoh format yang bisa dimuat:&#10;[00:08] I let it fall, my heart&#10;[00:12] And as it fell, you rose to claim" class="w-full bg-white border-4 border-black px-3 py-2 font-bold shadow-neo-md focus:outline-none focus:shadow-neo-sm focus:translate-x-0.5 focus:translate-y-0.5 transition-all" style="font-family: 'Times New Roman', Times, serif; font-size: 12px; resize: none;"></textarea>
        <p id="lyricStatus" class="text-xs font-bold text-gray-600 mt-2">Belum ada lirik</p>
      </div>

      <div>
        <span class="flex items-center gap-1.5 text-sm font-black uppercase mb-2">${icons.jumlah} Jumlah Soal</span>
        <div id="questionCount" class="grid grid-cols-6 gap-2" role="group" aria-label="Jumlah soal"></div>
        <p id="countError" class="hidden text-xs font-bold text-red-600 mt-2" role="alert"></p>
        <p class="text-xs font-bold text-gray-600 mt-2">Soal berupa campuran kata dan kalimat.</p>
      </div>

      <div>
        <span class="flex items-center gap-1.5 text-sm font-black uppercase mb-2">${icons.tingkat} Tingkat Kesulitan</span>
        <div id="difficultyLevel" class="grid grid-cols-5 gap-2" role="group" aria-label="Tingkat kesulitan"></div>
        <p id="difficultyError" class="hidden text-xs font-bold text-red-600 mt-2" role="alert"></p>
        <p class="text-xs font-bold text-gray-600 mt-2">1 = paling mudah, 5 = paling sulit</p>
      </div>

      <div class="relative flex gap-4 pt-4 border-t-4 border-black">
        <button id="resetBtn" type="button" class="flex-1 justify-items-center gap-2 bg-brand-red border-4 border-black shadow-neo-md active:shadow-none active:translate-x-1 active:translate-y-1 py-3 font-black text-lg uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed">${icons.reset} Reset</button>
        <button id="generateBtn" type="button" class="flex-1 flex items-center justify-center gap-2 bg-brand-green border-4 border-black shadow-neo-md active:shadow-none active:translate-x-1 active:translate-y-1 py-3 font-black text-lg uppercase transition-all disabled:opacity-70 disabled:cursor-wait">
          <span id="genLabel">${icons.mesin} Generate</span>
        </button>
        <span id="genSpinner" class="spinner hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true"></span>
      </div>

      <div class="text-xs font-bold text-black pt-4 border-t-4 border-black">
        <p class="font-black uppercase text-lg mb-2">💡 Tips</p>
        <ul class="space-y-2 list-none p-0 m-0">
          <li class="flex gap-2"><span aria-hidden="true">👉</span> Klik satu baris lirik untuk melompat ke bagian itu.</li>
          <li class="flex gap-2"><span aria-hidden="true">👉</span> Baris yang berulang (chorus) terisi bersamaan saat salah satunya dijawab.</li>
        </ul>
      </div>
    </div>
  </div>
  <div id="dialogToasts" class="pointer-events-none absolute bottom-4 inset-x-4 flex flex-col gap-2 items-center" aria-live="polite"></div>
</dialog>

<div id="toasts" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none px-4 w-full max-w-md" aria-live="polite"></div>
`;