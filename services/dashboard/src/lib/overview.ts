/**
 * Tipe & fungsi murni untuk halaman Dashboard (ringkasan).
 * Tidak mengimpor apa pun dari server, jadi aman dipakai di browser maupun route API,
 * dan bisa diuji tanpa database.
 */
import type { RiskLevel } from '@/lib/domain-risk'

export interface RangeOption {
  key: string
  hours: number
  /** teks panjang untuk kalimat, mis. "24 hours" */
  label: string
  /** teks pendek untuk tombol, mis. "24h" */
  short: string
  /** lebar satu batang grafik (ms) */
  bucketMs: number
}

const MIN = 60_000
const HOUR = 3_600_000

export const RANGES: RangeOption[] = [
  { key: '1h', hours: 1, label: '1 hour', short: '1h', bucketMs: 5 * MIN },
  { key: '6h', hours: 6, label: '6 hours', short: '6h', bucketMs: 30 * MIN },
  { key: '24h', hours: 24, label: '24 hours', short: '24h', bucketMs: HOUR },
  { key: '7d', hours: 168, label: '7 days', short: '7d', bucketMs: 24 * HOUR },
]

export const rangeByHours = (hours: number) => RANGES.find(r => r.hours === hours) ?? RANGES[2]

/** WIB = UTC+7 (tanpa DST). Dipakai agar batang harian jatuh pada pergantian hari WIB. */
export const WIB_OFFSET_MS = 7 * HOUR

export interface SeriesPoint {
  /** awal bucket, ISO UTC */
  start: string
  queries: number
  flagged: number
}

export interface ApUsage {
  ap_ip: string
  label: string
  queries: number
  clients: number
  flagged: number
  last_seen: string | null
}

export interface DomainUsage {
  domain: string
  queries: number
  clients: number
  risk: RiskLevel
}

export interface AttentionDomain extends DomainUsage {
  blocked: number
  type: string
  group: string
  aps: string[]
}

export interface RiskyClient {
  client_ip: string
  ap_ip: string
  ap_label: string
  queries: number
  domains: number
}

export interface OverviewData {
  hours: number
  /** rentang yang dipakai server (C1) */
  range_key?: string
  from?: string
  to?: string
  bucket_ms: number
  generated_at: string
  last_event_at: string | null
  totals: {
    queries: number
    prev_queries: number
    flagged: number
    watch: number
    clients: number
    domains: number
    active_now: number
  }
  series: SeriesPoint[]
  aps: ApUsage[]
  top_domains: DomainUsage[]
  attention: AttentionDomain[]
  risky_clients: RiskyClient[]
  blacklist: { active: number; total: number }
}

/**
 * Isi bucket yang kosong dengan nol supaya grafik tidak "melompat".
 * `rows` memakai awal bucket (ms epoch UTC) sebagai kunci.
 */
export function fillSeries(
  rows: { start: number; queries: number; flagged: number }[],
  hours: number,
  bucketMs: number,
  now: number,
): SeriesPoint[] {
  const count = Math.max(1, Math.round((hours * HOUR) / bucketMs))
  const lastStart = Math.floor((now + WIB_OFFSET_MS) / bucketMs) * bucketMs - WIB_OFFSET_MS
  const byStart = new Map(rows.map(r => [r.start, r]))
  const out: SeriesPoint[] = []
  for (let i = count - 1; i >= 0; i--) {
    const start = lastStart - i * bucketMs
    const hit = byStart.get(start)
    out.push({ start: new Date(start).toISOString(), queries: hit?.queries ?? 0, flagged: hit?.flagged ?? 0 })
  }
  return out
}

/**
 * Seperti fillSeries tetapi untuk rentang [from, to] sembarang (C1). Dibatasi 400 batang
 * agar respons tetap kecil.
 */
export function fillSeriesRange(
  rows: { start: number; queries: number; flagged: number }[],
  fromMs: number,
  toMs: number,
  bucketMs: number,
): SeriesPoint[] {
  const align = (ms: number) => Math.floor((ms + WIB_OFFSET_MS) / bucketMs) * bucketMs - WIB_OFFSET_MS
  const first = align(fromMs)
  const last = align(Math.max(fromMs, toMs - 1))
  const byStart = new Map(rows.map(r => [r.start, r]))
  const out: SeriesPoint[] = []
  for (let start = first; start <= last && out.length < 400; start += bucketMs) {
    const hit = byStart.get(start)
    out.push({ start: new Date(start).toISOString(), queries: hit?.queries ?? 0, flagged: hit?.flagged ?? 0 })
  }
  return out
}

/** Label sumbu-X dalam WIB: jam untuk bucket < 1 hari, tanggal untuk harian. */
export function bucketLabel(startIso: string, bucketMs: number): string {
  const d = new Date(startIso)
  if (bucketMs >= 24 * HOUR) {
    return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric' })
  }
  return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false })
}

export interface Headline {
  tone: RiskLevel | 'idle'
  title: string
  detail: string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

/** Ringkasan satu kalimat "bagaimana kondisi jaringan sekarang" untuk bagian atas dashboard. */
export function buildHeadline(d: OverviewData, rangePhrase: string): Headline {
  const t = d.totals
  if (t.queries === 0) {
    return {
      tone: 'idle',
      title: 'No data received yet',
      detail: `There were no DNS queries ${rangePhrase}. Check the MikroTik logs and the n8n workflow.`,
    }
  }
  if (t.flagged > 0) {
    const clients = new Set(d.risky_clients.map(c => c.client_ip)).size
    const aps = [...new Set(d.risky_clients.map(c => c.ap_label || c.ap_ip))]
    const top = d.attention.find(a => a.risk === 'flag')
    const parts = [
      clients > 0 ? `from ${plural(clients, 'client')}` : '',
      aps.length > 0 ? `on ${aps.slice(0, 2).join(' and ')}${aps.length > 2 ? ` +${aps.length - 2} more` : ''}` : '',
      top ? `most often ${top.domain}` : '',
    ].filter(Boolean)
    return {
      tone: 'flag',
      title: `${plural(t.flagged, 'risky request')} to review`,
      detail: (parts.join(', ') + '.').replace(/^./, c => c.toUpperCase()),
    }
  }
  if (t.watch > 0) {
    return {
      tone: 'watch',
      title: 'No risky access',
      detail: `${plural(t.watch, 'request')} to social media, streaming or gaming ${rangePhrase}.`,
    }
  }
  return {
    tone: 'safe',
    title: 'All activity looks normal',
    detail: `${plural(t.queries, 'query', 'queries')} from ${plural(t.clients, 'client')} ${rangePhrase}, none risky.`,
  }
}

/** Selisih persen terhadap periode sebelumnya; null bila tidak ada pembanding. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** Data dianggap basi bila event terakhir lebih lama dari ambang (default 15 menit). */
export function staleMinutes(lastEventIso: string | null, now: number, thresholdMin = 15): number | null {
  if (!lastEventIso) return null
  const t = new Date(lastEventIso).getTime()
  if (Number.isNaN(t)) return null
  const min = Math.round((now - t) / MIN)
  return min > thresholdMin ? min : null
}
