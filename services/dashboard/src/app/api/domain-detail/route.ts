import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { rangeFilter, riskOf } from '@/lib/query'
import { WIB_OFFSET, resolveRange } from '@/lib/time-range'
import { apIpExpr, apLabelExpr, asDate, flagQty, qty } from '@/lib/agg'
import { fillSeriesRange } from '@/lib/overview'
import { ipMaskerFor, clientDetailHidden } from '@/lib/privacy-settings'
import { labelsFor } from '@/lib/client-devices-db'

export const dynamic = 'force-dynamic'
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null)
const DOMAIN = /^[a-z0-9]([a-z0-9._-]{0,251}[a-z0-9])?$/i

/**
 * GET /api/domain-detail?domain=example.com&range=... — siapa mengakses, kapan, dari AP mana,
 * dan status blokir (blacklist/allowlist). IP klien disamarkan sesuai peran.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const domain = (sp.get('domain') ?? '').trim().toLowerCase()
  if (!DOMAIN.test(domain)) return NextResponse.json({ error: 'Invalid domain' }, { status: 400 })

  const range = resolveRange({ range: sp.get('range'), from: sp.get('from'), to: sp.get('to') })
  const win = { $and: [rangeFilter(range.from, range.to), { domain }] }
  const bucket = range.bucketMs

  try {
    const db = await getDb()
    const col = db.collection('ip_access_dns')
    const [totals, series, clients, aps, recent, bl, al, info] = await Promise.all([
      col.aggregate([
        { $match: win },
        {
          $group: {
            _id: null,
            queries: { $sum: qty },
            flagged: { $sum: flagQty },
            blocked: { $sum: { $cond: [{ $eq: ['$action', 'blocked'] }, qty, 0] } },
            clients: { $addToSet: '$client_ip' },
            first: { $min: asDate },
            last: { $max: asDate },
          },
        },
        { $project: { queries: 1, flagged: 1, blocked: 1, first: 1, last: 1, clients: { $size: '$clients' } } },
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
        { $group: { _id: '$client_ip', queries: { $sum: qty }, last: { $max: asDate } } },
        { $match: { _id: { $nin: [null, ''] } } },
        { $sort: { queries: -1 } },
        { $limit: 15 },
      ]).toArray(),
      col.aggregate([
        { $match: win },
        { $group: { _id: apIpExpr, label: { $last: apLabelExpr }, queries: { $sum: qty } } },
        { $match: { _id: { $nin: [null, ''] } } },
        { $sort: { queries: -1 } },
        { $limit: 10 },
      ]).toArray(),
      col.find(win).sort({ timestamp: -1 }).limit(20).toArray(),
      db.collection('dns_blacklist').findOne({ domain }),
      db.collection('dns_allowlist').findOne({ domain }),
      db.collection('dns_info').findOne({ domain }),
    ])

    const hidden = await clientDetailHidden(request)
    const mask = await ipMaskerFor(request)
    const labels = hidden ? {} : await labelsFor(clients.map(c => String(c._id)))
    const t = totals[0] ?? { queries: 0, flagged: 0, blocked: 0, clients: 0, first: null, last: null }

    return NextResponse.json(
      {
        domain,
        range_key: range.key,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        bucket_ms: bucket,
        totals: { queries: t.queries ?? 0, flagged: t.flagged ?? 0, blocked: t.blocked ?? 0, clients: t.clients ?? 0, first_seen: iso(t.first), last_seen: iso(t.last) },
        status: {
          blacklisted: bl ? { id: String(bl._id), type: String(bl.type ?? ''), group: String(bl.group ?? ''), active: bl.is_active !== false, expires_at: iso(bl.expires_at) } : null,
          allowlisted: Boolean(al),
          info: info ? { group: String(info.group ?? ''), type: String(info.type ?? '') } : null,
        },
        series: fillSeriesRange(
          series.filter(r => typeof r._id === 'number').map(r => ({ start: r._id as number, queries: r.queries as number, flagged: r.flagged as number })),
          range.from.getTime(),
          range.to.getTime(),
          bucket,
        ),
        clients: clients.map(c => ({
          ip: mask(String(c._id)),
          raw_hidden: hidden, // true → UI tidak membuat tautan ke detail klien
          label: labels[String(c._id)] ?? null,
          queries: c.queries as number,
          last_seen: iso(c.last),
        })),
        aps: aps.map(r => ({ ap_ip: String(r._id), label: (r.label as string) || String(r._id), queries: r.queries as number })),
        recent: recent.map(e => ({
          timestamp: iso(e.timestamp),
          client_ip: mask(String(e.client_ip ?? '')),
          action: String(e.action ?? ''),
          risk: riskOf(e as { risk_level?: string; action?: string; type?: string }),
          ap_label: String(e.ap_info?.label ?? e.ap_name ?? ''),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Domain detail API Error:', error)
    return NextResponse.json({ error: 'Failed to load the domain' }, { status: 500 })
  }
}
