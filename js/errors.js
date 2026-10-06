export const ERR = {
  NETWORK: 'Gagal terhubung ke server. Periksa koneksi internet kamu.',
  BACKEND_INVALID: 'Respons dari server tidak valid.',
  BACKEND_HTTP: (code) => `Server mengembalikan error ${code}.`,
  TRANSCRIPT_EMPTY: 'Server tidak mengembalikan transcript.',
  LYRICS_NOT_FOUND: 'Lirik tidak ditemukan. Silakan isi manual.',
  GENERATE_FAILED: 'Gagal membuat soal dari server.',
  TITLE_FAILED: 'Gagal mengambil judul video.',
  YT_API_FAILED: 'YouTube API gagal dimuat. Periksa koneksi internet.',
};

export class AppError extends Error {
  constructor(message, { cause, code = 'APP_ERROR' } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}