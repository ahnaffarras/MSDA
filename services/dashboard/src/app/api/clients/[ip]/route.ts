import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { rangeFilter, riskOf } from '@/lib/query'
import { WIB_OFFSET, resolveRange } from '@/lib/time-range'
import { apIpExpr, apLabelExpr, asDate, flagQty, qty } from '@/lib/agg'
import { fillSeriesRange } from '@/lib/overview'
import { clientDetailHidden } from '@/lib/privacy-settings'
import { devicesCol, toDevice } from '@/lib/client-devices-db'
import { isValidIp } from '@/lib/client-devices'

export const dynamic = 'force-dynamic'
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null)

/**
 * GET /api/clients/:ip?range=... — detail satu klien: timeline akses, domain teratas, AP yang
 * dipakai, perangkat berlabel. Disembunyikan dari viewer bila penyamaran privasi aktif.
 */
export async function GET(request: Request, { params }: { params: Promise<{ ip: string }> }) {
  const ip = decodeURIComponent((await params).ip)
  if (!isValidIp(ip)) return NextResponse.json({ error: 'Invalid IP address' }, { status: 400 })
  if (await clientDetailHidden(request)) {
    return NextResponse.json({ error: 'Client details are hidden for your role', code: 'hidden_for_role' }, { status: 403 })
  }

  const sp = new URL(request.url).searchParams
  const range = resolveRange({ range: sp.get('range'), from: sp.get('from'), to: sp.get('to') })
  const win = { $and: [rangeFilter(range.from, range.to), { client_ip: ip }] }
  const bucket = range.bucketMs

  try {
    const db = await getDb()
    const col = db.collection('ip_access_dns')
    const [totals, series, domains, aps, recent, device] = await Promise.all([
      col.aggregate([
        { $match: win },
        { $group: { _id: null, queries: { $sum: qty }, flagged: { $sum: flagQty }, domains: { $addToSet: '$domain' }, first: { $min: asDate }, last: { $max: asDate } } },
        { $project: { queries: 1, flagged: 1, first: 1, last: 1, domains: { $size: '$domains' } } },
      ]).toArray(),
      col.aggregate([
        { $match: win },
        {
          $group: {
            _id: { $subtract: [{ $toLong: asDate }, { $mod: [{ $add: [{ $toLong: asDate }, WIB_OFFSET] }, bucket] }] },
            queries: { $sum: qty },
            flagged: { $sum: flagQty },
          },
        },
      ]).toArray(),
      col.aggregate([
        { $match: win },
        { $group: { _id: '$domain', queries: { $sum: qty }, blocked: { $sum: { $cond: [{ $eq: ['$action', 'blocked'] }, qty, 0] } }, type: { $last: '$type' }, group: { $last: '$group' } } },
        { $match: { _id: { $nin: [null, ''] } } },
        { $sort: { queries: -1 } },
        { $limit: 15 },
      ]).toArray(),
      col.aggregate([
        { $match: win },
        { $group: { _id: apIpExpr, label: { $last: apLabelExpr }, queries: { $sum: qty }, last: { $max: asDate } } },
        { $match: { _id: { $nin: [null, ''] } } },
        { $sort: { queries: -1 } },
        { $limit: 10 },
      ]).toArray(),
      col.find(win).sort({ timestamp: -1 }).limit(30).toArray(),
      devicesCol().then(c => c.find({ $or: [{ ip }, { 'ip_history.ip': ip }] }).sort({ updated_at: -1 }).limit(1).toArray()),
    ])

    const t = totals[0] ?? { queries: 0, flagged: 0, domains: 0, first: null, last: null }
    return NextResponse.json(
      {
        ip,
        range_key: range.key,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        bucket_ms: bucket,
        device: device[0] ? toDevice(device[0]) : null,
        totals: { queries: t.queries ?? 0, flagged: t.flagged ?? 0, domains: t.domains ?? 0, first_seen: iso(t.first), last_seen: iso(t.last) },
        series: fillSeriesRange(
          series.filter(r => typeof r._id === 'number').map(r => ({ start: r._id as number, queries: r.queries as number, flagged: r.flagged as number })),
          range.from.getTime(),
          range.to.getTime(),
          bucket,
        ),
        top_domains: domains.map(r => ({
          domain: String(r._id),
          queries: r.queries as number,
          type: (r.type as string) ?? '',
          group: (r.group as string) ?? '',
          risk: riskOf({ type: r.type as string, action: (r.blocked as number) > 0 ? 'blocked' : undefined }),
        })),
        aps: aps.map(r => ({ ap_ip: String(r._id), label: (r.label as string) || String(r._id), queries: r.queries as number, last_seen: iso(r.last) })),
        recent: recent.map(e => ({
          timestamp: iso(e.timestamp),
          domain: String(e.domain ?? ''),
          action: String(e.action ?? ''),
          risk: riskOf(e as { risk_level?: string; action?: string; type?: string }),
          ap_label: String(e.ap_info?.label ?? e.ap_name ?? ''),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Client detail API Error:', error)
    return NextResponse.json({ error: 'Failed to load the client' }, { status: 500 })
  }
}
