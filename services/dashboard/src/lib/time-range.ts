/**
 * Rentang waktu global (C1). Fungsi murni, aman dipakai di browser dan route API,
 * dan diuji tanpa database.
 *
 * Bentuk di URL (bisa dibagikan):  ?range=today|24h|7d|30d   atau
 *                                  ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Tanggal kustom = hari kalender WIB (UTC+7), batas atas inklusif.
 */

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 24 * HOUR
export const WIB_OFFSET = 7 * HOUR
export const MAX_CUSTOM_DAYS = 90

export type RangeKey = 'today' | '24h' | '7d' | '30d' | 'custom'

export interface RangeParams {
  range?: string | null
  from?: string | null
  to?: string | null
}

export interface ResolvedRange {
  key: RangeKey
  from: Date
  to: Date
  /** jumlah jam (dibulatkan ke atas), untuk API lama yang memakai `hours` */
  hours: number
  /** teks pendek untuk tombol */
  short: string
  /** keterangan adverbial untuk kalimat: "today", "in the last 7 days", "from 13 Oct to 15 Oct" */
  phrase: string
  /** judul pendek untuk panel/caption: "Today", "Last 7 days", "13 Oct – 15 Oct" */
  caption: string
  /** lebar satu batang grafik (ms) */
  bucketMs: number
  /** periode pembanding: rentang sama panjang tepat sebelum `from` */
  prevFrom: Date
  prevTo: Date
}

export const RANGE_PRESETS: { key: Exclude<RangeKey, 'custom'>; short: string }[] = [
  { key: 'today', short: 'Today' },
  { key: '24h', short: '24h' },
  { key: '7d', short: '7d' },
  { key: '30d', short: '30d' },
]

export const DEFAULT_RANGE: RangeKey = '24h'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Awal hari WIB (00:00 WIB) yang memuat `ms`, dalam epoch ms UTC. */
export function startOfWibDay(ms: number): number {
  return Math.floor((ms + WIB_OFFSET) / DAY) * DAY - WIB_OFFSET
}

/** YYYY-MM-DD → epoch ms awal hari WIB; null bila bukan tanggal kalender yang valid. */
export function parseWibDate(v: string | null | undefined): number | null {
  if (!v || !YMD.test(v)) return null
  const ms = Date.parse(`${v}T00:00:00.000+07:00`)
  if (Number.isNaN(ms)) return null
  // tolak 2026-02-31 yang diam-diam bergeser ke Maret
  const back = new Date(ms + WIB_OFFSET).toISOString().slice(0, 10)
  return back === v ? ms : null
}

export const toWibYmd = (ms: number): string => new Date(ms + WIB_OFFSET).toISOString().slice(0, 10)

/** Lebar bucket mengikuti panjang rentang supaya jumlah batang tetap wajar. */
export function bucketFor(spanMs: number): number {
  if (spanMs <= 2 * HOUR) return 5 * MIN
  if (spanMs <= 12 * HOUR) return 30 * MIN
  if (spanMs <= 48 * HOUR) return HOUR
  return DAY
}

const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })

export function resolveRange(input: RangeParams = {}, nowDate: Date = new Date()): ResolvedRange {
  const now = nowDate.getTime()
  const key = (input.range ?? DEFAULT_RANGE) as string

  let k: RangeKey = '24h'
  let from = now - DAY
  let to = now
  let short = '24h'
  let phrase = 'in the last 24 hours'
  let caption = 'Last 24 hours'

  if (key === 'today') {
    k = 'today'
    from = startOfWibDay(now)
    short = 'Today'
    phrase = 'today'
    caption = 'Today'
  } else if (key === '7d') {
    k = '7d'
    from = now - 7 * DAY
    short = '7d'
    phrase = 'in the last 7 days'
    caption = 'Last 7 days'
  } else if (key === '30d') {
    k = '30d'
    from = now - 30 * DAY
    short = '30d'
    phrase = 'in the last 30 days'
    caption = 'Last 30 days'
  } else if (key === 'custom') {
    const f = parseWibDate(input.from)
    const t = parseWibDate(input.to)
    if (f !== null && t !== null && t >= f) {
      k = 'custom'
      const endExclusive = Math.min(t + DAY, now) // jangan melewati "sekarang"
      from = Math.max(f, endExclusive - MAX_CUSTOM_DAYS * DAY)
      to = endExclusive
      short = 'Custom'
      phrase = f === t ? `on ${fmtDay(f)}` : `from ${fmtDay(f)} to ${fmtDay(t)}`
      caption = f === t ? fmtDay(f) : `${fmtDay(f)} – ${fmtDay(t)}`
    }
    // tanggal tak valid → kembali ke 24 jam (default di atas)
  }

  const span = Math.max(to - from, MIN)
  return {
    key: k,
    from: new Date(from),
    to: new Date(to),
    hours: Math.max(1, Math.ceil(span / HOUR)),
    short,
    phrase,
    caption,
    bucketMs: bucketFor(span),
    prevFrom: new Date(from - span),
    prevTo: new Date(from),
  }
}

/** Query-string standar untuk dikirim ke API / disimpan di URL. */
export function rangeQuery(input: RangeParams = {}): string {
  const key = input.range ?? DEFAULT_RANGE
  if (key === 'custom' && parseWibDate(input.from) !== null && parseWibDate(input.to) !== null) {
    return `range=custom&from=${input.from}&to=${input.to}`
  }
  return `range=${key === 'custom' ? DEFAULT_RANGE : key}`
}

export const paramsFromSearch = (sp: { get(name: string): string | null }): RangeParams => ({
  range: sp.get('range'),
  from: sp.get('from'),
  to: sp.get('to'),
})
