/**
 * Hook bawaan Next.js: dipanggil sekali saat server start.
 * Dipakai untuk menyalakan timer Storage & Cleanup dan memastikan akun administrator
 * pertama ada. Hanya di runtime Node.js (driver MongoDB tidak jalan di Edge), dan
 * diimpor dinamis agar tidak ikut di-bundle untuk Edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startStorageScheduler } = await import('./lib/storage-scheduler')
  startStorageScheduler()
  const { bootstrapWithRetry } = await import('./lib/auth')
  bootstrapWithRetry()
  // Index koleksi data DNS (D7), di latar belakang agar start tidak tertahan
  const { ensureDataIndexesInBackground } = await import('./lib/data-indexes')
  ensureDataIndexesInBackground()
}
