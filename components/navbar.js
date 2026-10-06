export const navbarHTML = `
<nav class="bg-brand-yellow border-b-4 border-black sticky top-0 z-30 h-16">
  <div class="max-w-7xl mx-auto px-4 h-full flex items-center gap-3 sm:gap-4">
    <div id="brandStatus" class="flex items-center gap-2 shrink-0 cursor-pointer select-none" role="button" tabindex="0" title="Cek status server">
      <span id="headerIcon"></span>
      <h1 class="hidden sm:block text-2xl font-black uppercase tracking-wider text-black">MR. AL</h1>
    </div>

    <div class="flex-1 flex items-center gap-4 min-w-0">
      <button id="playBtn" type="button" class="btn-neo bg-brand-green text-black px-4 py-2 flex items-center gap-2 shrink-0">
        <span id="playIcon" aria-hidden="true">▶</span> <span id="playText">Play</span>
      </button>
      
      <div id="progressContainer" role="slider" tabindex="0" aria-label="Posisi lagu"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
           class="flex-1 py-3 cursor-pointer touch-none min-w-15">
        <div class="relative h-4 bg-white border-2 border-black overflow-hidden shadow-neo-sm">
          <div id="progressBar" class="progress-bar h-full bg-brand-pink border-r-2 border-black w-0"></div>
        </div>
      </div>
      <span id="timeDisplay" class="text-sm font-bold text-black min-w-19 sm:min-w-22.5 text-right tabular-nums shrink-0">0:00 / 0:00</span>
    </div>

    <button id="sidebarBtn" type="button" class="btn-neo bg-white p-2 hover:bg-brand-hover text-black shrink-0" title="Pengaturan" aria-label="Buka pengaturan">
      <svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
    </button>
  </div>
</nav>
`;