/**
 * Timer pembersihan & pencatatan ukuran database.
 *
 * Dijalankan SEKALI saat server Next.js start (lihat src/instrumentation.ts), lalu tiap
 * menit memanggil runSchedulerTick(). Seluruh jadwal (kapan snapshot, koleksi mana yang
 * dibersihkan tiap berapa hari) dibaca dari MongoDB, jadi perubahan dari halaman
 * Storage berlaku tanpa restart.
 *
 * Matikan dengan env STORAGE_SCHEDULER=off (mis. kalau ada beberapa replika dashboard
 * dan hanya satu yang boleh menjalankan timer).
 */
import { getDb } from '@/lib/db'
import { runSchedulerTick } from '@/lib/storage-service'

declare global {
  var _msdaStorageScheduler: ReturnType<typeof setInterval> | undefined
}

const TICK_MS = 60_000
const FIRST_DELAY_MS = 20_000

export function startStorageScheduler(): void {
  if (process.env.STORAGE_SCHEDULER === 'off') {
    console.log('[storage] scheduler disabled (STORAGE_SCHEDULER=off)')
    return
  }
  if (!process.env.MONGODB_URI) {
    console.warn('[storage] MONGODB_URI is not set; scheduler not started')
    return
  }
  // Satu timer per proses, juga saat modul dimuat ulang (HMR di mode dev).
  if (globalThis._msdaStorageScheduler) return

  let running = false
  const tick = async () => {
    if (running) return // putaran sebelumnya belum selesai
    running = true
    try {
      await runSchedulerTick(await getDb())
    } catch (e) {
      console.error('[storage] scheduler tick failed:', e instanceof Error ? e.message : e)
    } finally {
      running = false
    }
  }

  const interval = setInterval(() => void tick(), TICK_MS)
  globalThis._msdaStorageScheduler = interval
  interval.unref?.()
  setTimeout(() => void tick(), FIRST_DELAY_MS).unref?.()
  console.log('[storage] scheduler started (checks every 60s)')
}
