/**
 * Tipe & fungsi murni untuk grafik tren dan heatmap (C2). Aman dipakai di browser dan
 * route API; diuji tanpa database.
 */
import type { SeriesPoint } from '@/lib/overview'

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export interface Heatmap {
  /** cells[hari 0=Senin..6=Minggu][jam 0..23], dalam WIB */
  cells: number[][]
  max: number
}

export interface TrendsData {
  range_key: string
  from: string
  to: string
  bucket_ms: number
  series: SeriesPoint[]
  /** jumlah query periode sebelumnya, sejajar per indeks dengan `series` */
  prev_queries: number[]
  totals: { queries: number; flagged: number; prev_queries: number; prev_flagged: number }
  /** perubahan persen vs periode sebelumnya; null bila periode sebelumnya kosong */
  delta: { queries: number | null; flagged: number | null }
  heatmap: Heatmap
}

/** Perubahan persen (dibulatkan). null bila pembanding 0 — persentase tidak bermakna. */
export function percentDelta(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}

/**
 * Susun hasil agregasi Mongo menjadi matriks 7×24 (Senin-dulu).
 * `$dayOfWeek` Mongo: 1 = Minggu … 7 = Sabtu.
 */
export function buildHeatmap(rows: { _id: { dow: number; hour: number }; queries: number }[]): Heatmap {
  const cells = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  let max = 0
  for (const r of rows) {
    const dow = r._id?.dow
    const hour = r._id?.hour
    if (!Number.isInteger(dow) || !Number.isInteger(hour) || dow < 1 || dow > 7 || hour < 0 || hour > 23) continue
    const row = (dow + 5) % 7
    cells[row][hour] += r.queries
    if (cells[row][hour] > max) max = cells[row][hour]
  }
  return { cells, max }
}
