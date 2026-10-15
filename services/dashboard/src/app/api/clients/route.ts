import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { escapeRegex, rangeFilter } from '@/lib/query'
import { resolveRange } from '@/lib/time-range'
import { apLabelExpr, asDate, flagQty, qty } from '@/lib/agg'
import { ipMaskerFor, clientDetailHidden } from '@/lib/privacy-settings'
import { labelsFor } from '@/lib/client-devices-db'

export const dynamic = 'force-dynamic'
const PAGE = 50

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : null)

/**
 * GET /api/clients?range=...&q=ip-awalan&page=
 * Klien yang terlihat di trafik pada rentang itu, urut query terbanyak. Agregasi di MongoDB.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const range = resolveRange({ range: sp.get('range'), from: sp.get('from'), to: sp.get('to') })
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.get('page') ?? '1', 10) || 1))
  const q = (sp.get('q') ?? '').trim().slice(0, 45)

  const match: Record<string, unknown> = { $and: [rangeFilter(range.from, range.to), { client_ip: { $nin: [null, ''] } }] }
  if (q) (match.$and as unknown[]).push({ client_ip: { $regex: `^${escapeRegex(q)}` } })

  try {
    const col = (await getDb()).collection('ip_access_dns')
    const group = {
      $group: {
        _id: '$client_ip',
        queries: { $sum: qty },
        flagged: { $sum: flagQty },
        domains: { $addToSet: '$domain' },
        aps: { $addToSet: apLabelExpr },
        first: { $min: asDate },
        last: { $max: asDate },
      },
    }
    const [rows, countRows] = await Promise.all([
      col.aggregate([
        { $match: match },
        group,
        { $project: { queries: 1, flagged: 1, first: 1, last: 1, domains: { $size: '$domains' }, aps: 1 } },
        { $sort: { queries: -1, _id: 1 } },
        { $skip: (page - 1) * PAGE },
        { $limit: PAGE },
      ]).toArray(),
      col.aggregate([{ $match: match }, { $group: { _id: '$client_ip' } }, { $count: 'n' }]).toArray(),
    ])
    const total = (countRows[0]?.n as number | undefined) ?? 0

    const hidden = await clientDetailHidden(request)
    const mask = await ipMaskerFor(request)
    const labels = hidden ? {} : await labelsFor(rows.map(r => String(r._id)))

    return NextResponse.json(
      {
        data: rows.map(r => ({
          ip: mask(String(r._id)),
          label: labels[String(r._id)] ?? null,
          queries: r.queries as number,
          flagged: r.flagged as number,
          domains: r.domains as number,
          aps: ((r.aps as (string | null)[]) ?? []).filter((a): a is string => Boolean(a)).sort(),
          first_seen: iso(r.first),
          last_seen: iso(r.last),
        })),
        meta: { page, limit: PAGE, total, total_pages: Math.max(1, Math.ceil(total / PAGE)), hidden },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Clients API Error:', error)
    return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 })
  }
}
