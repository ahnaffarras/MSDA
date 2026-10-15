import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { rangeFilter } from '@/lib/query'
import { WIB_OFFSET, resolveRange } from '@/lib/time-range'
import { asDate, flagQty, qty } from '@/lib/agg'
import { fillSeriesRange } from '@/lib/overview'
import { buildHeatmap, percentDelta, type TrendsData } from '@/lib/trends'

export const dynamic = 'force-dynamic'

/**
 * GET /api/trends?range=...[&from=&to=][&ap_ip=ip1,ip2]
 *
 * Tren query/flagged per bucket, perbandingan dengan periode sebelumnya, dan heatmap
 * jam × hari (WIB). SEMUA agregasi dikerjakan di MongoDB; browser hanya menerima
 * ≤ 400 titik + 168 sel, bukan data mentah.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const range = resolveRange({ range: sp.get('range'), from: sp.get('from'), to: sp.get('to') })
  const ips = (sp.get('ap_ip') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 200)

  const fromMs = range.from.getTime()
  const toMs = range.to.getTime()
  const spanMs = toMs - fromMs
  const bucket = range.bucketMs

  const apMatch = { $or: [{ 'ap_info.ip': { $in: ips } }, { ap_ip: { $in: ips } }] }
  const scoped = (f: Record<string, unknown>) => (ips.length ? { $and: [f, apMatch] } : f)

  // awal bucket (epoch ms UTC) selaras kalender WIB; `shift` memindahkan periode sebelumnya ke sumbu waktu sekarang
  const bucketId = (shift: number) => ({
    $subtract: [
      { $add: [{ $toLong: asDate }, shift] },
      { $mod: [{ $add: [{ $toLong: asDate }, shift, WIB_OFFSET] }, bucket] },
    ],
  })

  try {
    const col = (await getDb()).collection('ip_access_dns')
    const [curRows, prevRows, heatRows] = await Promise.all([
      col.aggregate([
        { $match: scoped(rangeFilter(range.from, range.to)) },
        { $group: { _id: bucketId(0), queries: { $sum: qty }, flagged: { $sum: flagQty } } },
      ]).toArray(),
      col.aggregate([
        { $match: scoped(rangeFilter(range.prevFrom, range.prevTo)) },
        { $group: { _id: bucketId(spanMs), queries: { $sum: qty }, flagged: { $sum: flagQty } } },
      ]).toArray(),
      col.aggregate([
        { $match: scoped(rangeFilter(range.from, range.to)) },
        {
          $group: {
            _id: {
              dow: { $dayOfWeek: { date: asDate, timezone: '+07:00' } },
              hour: { $hour: { date: asDate, timezone: '+07:00' } },
            },
            queries: { $sum: qty },
          },
        },
      ]).toArray(),
    ])

    type Row = { _id: unknown; queries?: number; flagged?: number }
    const numeric = (rows: unknown[]) => (rows as Row[]).filter(r => typeof r._id === 'number')
    const cur = numeric(curRows).map(r => ({ start: r._id as number, queries: r.queries ?? 0, flagged: r.flagged ?? 0 }))
    const prev = numeric(prevRows).map(r => ({ start: r._id as number, queries: r.queries ?? 0, flagged: r.flagged ?? 0 }))
    const prevByStart = new Map(prev.map(r => [r.start, r.queries]))

    const series = fillSeriesRange(cur, fromMs, toMs, bucket)
    const sum = (rows: { queries: number; flagged: number }[], k: 'queries' | 'flagged') => rows.reduce((a, r) => a + r[k], 0)

    const totals = {
      queries: sum(cur, 'queries'),
      flagged: sum(cur, 'flagged'),
      prev_queries: sum(prev, 'queries'),
      prev_flagged: sum(prev, 'flagged'),
    }

    const body: TrendsData = {
      range_key: range.key,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      bucket_ms: bucket,
      series,
      prev_queries: series.map(p => prevByStart.get(Date.parse(p.start)) ?? 0),
      totals,
      delta: { queries: percentDelta(totals.queries, totals.prev_queries), flagged: percentDelta(totals.flagged, totals.prev_flagged) },
      heatmap: buildHeatmap(heatRows as { _id: { dow: number; hour: number }; queries: number }[]),
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Trends API Error:', error)
    return NextResponse.json({ error: 'Failed to load trends' }, { status: 500 })
  }
}
