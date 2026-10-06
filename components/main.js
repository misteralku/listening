export const mainHTML = `
<main class="max-w-7xl mx-auto p-4 grid gap-6 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-2 h-[calc(100dvh-4rem)]">

  <section class="card-neo flex flex-col min-h-0">
    <div class="bg-brand-pink px-4 py-3 border-b-4 border-black flex items-center justify-between gap-3 flex-wrap">
      <h2 class="font-black text-lg uppercase flex items-center gap-2">Lirik</h2>
      <span id="lyricSourceIcon" class="flex items-center"></span>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2 text-sm font-bold select-none text-black">
          <span>Tampilkan penuh</span>
          <label for="toggleFull" class="relative cursor-pointer">
            <input type="checkbox" id="toggleFull" class="sr-only peer">
            <div class="w-10 h-6 bg-white border-2 border-black peer-checked:bg-brand-green transition-colors"></div>
            <div class="absolute left-1 top-1 size-4 bg-black transition-transform peer-checked:translate-x-4"></div>
          </label>
        </div>
      </div>
    </div>

    <div class="relative flex-1 min-h-0">
      <div id="lyricsContainer" data-mode="cloze" class="absolute inset-0 overflow-y-auto p-4 space-y-1 text-lg leading-relaxed"></div>
      <button id="followLyrics" type="button" class="hidden absolute bottom-3 left-1/2 -translate-x-1/2 bg-brand-yellow border-2 border-black shadow-neo-md active:shadow-none text-sm px-4 py-2 font-bold uppercase transition-all">⤓ Ikuti lagu</button>
    </div>

    <div id="scoreBar" class="p-4 border-t-4 border-black bg-brand-gray text-sm flex justify-between font-black uppercase">
      <span>Soal terjawab: <span id="scoreText" class="text-blue-700">0 / 0</span></span>
      <span>Akurasi: <span id="accuracyText" class="text-green-700">-</span></span>
    </div>
  </section>

  <section class="card-neo flex flex-col min-h-0">
    <div class="bg-brand-teal px-4 py-3 border-b-4 border-black">
      <h2 class="font-black text-lg uppercase flex items-center gap-2">Pilihan Jawaban</h2>
      <p class="text-sm font-bold mt-1 text-black">Klik jawaban untuk mengisi bagian rumpang.</p>
    </div>
    <div class="relative flex-1 min-h-0">
      <div id="quizContainer" class="absolute inset-0 overflow-y-auto p-4 space-y-4"></div>
      <button id="followQuiz" type="button" class="hidden absolute bottom-3 left-1/2 -translate-x-1/2 bg-brand-yellow border-2 border-black shadow-neo-md active:shadow-none text-sm px-4 py-2 font-bold uppercase transition-all">⤓ Ikuti lagu</button>
    </div>
  </section>
</main>
`;