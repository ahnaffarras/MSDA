import type { Db } from 'mongodb'
import {
  formatDateLabel,
  formatTimestamp,
  buildReportText,
  buildRawData,
  type DnsAiReportDoc,
  type DnsDailyStatsDoc,
} from '@/lib/report-format'
import { resolveRange, toWibYmd, type RangeParams } from '@/lib/time-range'

/** Bentuk laporan harian yang dikirim ke dashboard (daftar maupun ekspor). */
export interface ReportRow {
  _id: string
  /** YYYY-MM-DD (WIB) bila tersedia */
  date: string
  timestamp: string
  date_label: string
  report_text: string
  raw_rows: number
  ap_count: number
  raw_data: ReturnType<typeof buildRawData>
}

/**
 * Batas tanggal (YYYY-MM-DD, WIB) dari parameter rentang global. Tanpa `range`, tidak
 * ada filter (perilaku lama: 30 laporan terbaru).
 */
export function dateBoundsFor(params: RangeParams): { from: string; to: string } | null {
  if (!params.range) return null
  const r = resolveRange(params)
  return { from: toWibYmd(r.from.getTime()), to: toWibYmd(r.to.getTime() - 1) }
}

/** Laporan AI harian digabung dengan statistik harian (`dns_daily_stats`) lewat field `date`. */
export async function loadReports(db: Db, opts: { bounds?: { from: string; to: string } | null; limit?: number } = {}): Promise<ReportRow[]> {
  const filter = opts.bounds ? { date: { $gte: opts.bounds.from, $lte: opts.bounds.to } } : {}
  const aiReports = await db
    .collection<DnsAiReportDoc>('dns_ai_reports')
    .find(filter)
    .sort({ date: -1 })
    .limit(opts.limit ?? 30)
    .toArray()

  const dates = aiReports.map(r => r.date).filter(Boolean)
  const stats = dates.length
    ? await db.collection<DnsDailyStatsDoc>('dns_daily_stats').find({ date: { $in: dates } }).toArray()
    : []
  const byDate = new Map<string, DnsDailyStatsDoc>()
  for (const s of stats) if (s.date) byDate.set(s.date, s)

  return aiReports.map(report => {
    const st = report.date ? byDate.get(report.date) : undefined
    const rawRows = typeof st?.total_requests === 'number' ? st.total_requests : (report.summary?.total_requests?.today ?? 0)
    const apCount = Array.isArray(st?.per_ap)
      ? st.per_ap.length
      : Array.isArray(report.trends?.ap_totals)
        ? report.trends.ap_totals.length
        : 0
    return {
      _id: String(report._id),
      date: report.date ?? '',
      timestamp: formatTimestamp(report.generated_at, report.date),
      date_label: formatDateLabel(report.date, report.partial),
      report_text: buildReportText(report, st),
      raw_rows: rawRows,
      ap_count: apCount,
      raw_data: buildRawData(st),
    }
  })
}
