import { NextResponse } from 'next/server'
import type { Document } from 'mongodb'
import { getDb } from '@/lib/db'
import { intParam, riskOf, sinceFilter } from '@/lib/query'
import { FLAG_TYPE_LIST, WATCH_TYPE_LIST, type RiskLevel } from '@/lib/domain-risk'
import {
  WIB_OFFSET_MS,
  fillSeries,
  rangeByHours,
  type AttentionDomain,
  type OverviewData,
} from '@/lib/overview'

/**
 * GET /api/overview?hours=24
 *
 * Satu panggilan untuk seluruh halaman Dashboard. Semua agregasi dikerjakan di MongoDB
 * (tidak ada ribuan event ditarik ke browser). Field dibaca toleran terhadap dua bentuk
 * dokumen: ap_info.{ip,label} (baru) dan ap_ip/ap_name datar (lama).
 */
const qty = { $ifNull: ['$access_count', 1] }
const apIp = { $ifNull: ['$ap_info.ip', '$ap_ip'] }
const apLabel = { $ifNull: ['$ap_info.label', '$ap_name'] }
const asDate = { $convert: { input: '$timestamp', to: 'date', onError: null, onNull: null } }

// "berisiko" = kena blacklist ATAU kategori domainnya berisiko; "perhatian" = kategori sosial/streaming/game
const isFlag = { $or: [{ $eq: ['$action', 'blocked'] }, { $in: ['$type', FLAG_TYPE_LIST] }] }
const flagQty = { $cond: [isFlag, qty, 0] }
const watchQty = { $cond: [{ $and: [{ $not: [isFlag] }, { $in: ['$type', WATCH_TYPE_LIST] }] }, qty, 0] }
const blockedQty = { $cond: [{ $eq: ['$action', 'blocked'] }, qty, 0] }

const flagMatch = {
  $or: [{ action: 'blocked' }, { type: { $in: FLAG_TYPE_LIST } }],
}
const attentionMatch = {
  $or: [{ action: 'blocked' }, { type: { $in: [...FLAG_TYPE_LIST, ...WATCH_TYPE_LIST] } }],
}

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : typeof v === 'string' && v ? v : null)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const hours = intParam(searchParams.get('hours'), 24, 1, 168)
  const range = rangeByHours(hours)

  try {
    const db = await getDb()
    const col = db.collection('ip_access_dns')
    const win = sinceFilter(hours)
    const within = (extra: Document) => ({ $and: [win, extra] })

    const [totalsRows, prevRows, activeNow, seriesRows, apRows, topRows, attnRows, clientRows, blActive, blTotal] =
      await Promise.all([
        col.aggregate([
          { $match: win },
          {
            $group: {
              _id: null,
              queries: { $sum: qty },
              flagged: { $sum: flagQty },
              watch: { $sum: watchQty },
              clients: { $addToSet: '$client_ip' },
              domains: { $addToSet: '$domain' },
              last: { $max: asDate },
            },
          },
          { $project: { queries: 1, flagged: 1, watch: 1, last: 1, clients: { $size: '$clients' }, domains: { $size: '$domains' } } },
        ]).toArray(),

        // total dua kali rentang; dikurangi rentang ini = periode sebelumnya
        col.aggregate([{ $match: sinceFilter(hours * 2) }, { $group: { _id: null, queries: { $sum: qty } } }]).toArray(),

        col.distinct('client_ip', sinceFilter(10 / 60)),

        col.aggregate([
          { $match: win },
          {
            $group: {
              // awal bucket (ms UTC), diselaraskan ke kalender WIB
              _id: {
                $subtract: [
                  { $toLong: asDate },
                  { $mod: [{ $add: [{ $toLong: asDate }, WIB_OFFSET_MS] }, range.bucketMs] },
                ],
              },
              queries: { $sum: qty },
              flagged: { $sum: flagQty },
            },
          },
        ]).toArray(),

        col.aggregate([
          { $match: win },
          {
            $group: {
              _id: apIp,
              label: { $last: apLabel },
              queries: { $sum: qty },
              flagged: { $sum: flagQty },
              clients: { $addToSet: '$client_ip' },
              last: { $max: asDate },
            },
          },
          { $match: { _id: { $nin: [null, ''] } } },
          { $project: { label: 1, queries: 1, flagged: 1, last: 1, clients: { $size: '$clients' } } },
          { $sort: { queries: -1 } },
          { $limit: 100 },
        ]).toArray(),

        col.aggregate([
          { $match: win },
          {
            $group: {
              _id: '$domain',
              queries: { $sum: qty },
              blocked: { $sum: blockedQty },
              type: { $last: '$type' },
              clients: { $addToSet: '$client_ip' },
            },
          },
          { $match: { _id: { $nin: [null, ''] } } },
          { $project: { queries: 1, blocked: 1, type: 1, clients: { $size: '$clients' } } },
          { $sort: { queries: -1 } },
          { $limit: 8 },
        ]).toArray(),

        col.aggregate([
          { $match: within(attentionMatch) },
          {
            $group: {
              _id: '$domain',
              queries: { $sum: qty },
              blocked: { $sum: blockedQty },
              type: { $last: '$type' },
              group: { $last: '$group' },
              clients: { $addToSet: '$client_ip' },
              aps: { $addToSet: apLabel },
            },
          },
          { $match: { _id: { $nin: [null, ''] } } },
          { $project: { queries: 1, blocked: 1, type: 1, group: 1, aps: 1, clients: { $size: '$clients' } } },
          { $sort: { queries: -1 } },
          { $limit: 40 },
        ]).toArray(),

        col.aggregate([
          { $match: within(flagMatch) },
          {
            $group: {
              _id: { client: '$client_ip', ap: apIp },
              ap_label: { $last: apLabel },
              queries: { $sum: qty },
              domains: { $addToSet: '$domain' },
            },
          },
          { $match: { '_id.client': { $nin: [null, ''] } } },
          { $project: { ap_label: 1, queries: 1, domains: { $size: '$domains' } } },
          { $sort: { queries: -1 } },
          { $limit: 6 },
        ]).toArray(),

        db.collection('dns_blacklist').countDocuments({ is_active: { $ne: false } }),
        db.collection('dns_blacklist').countDocuments({}),
      ])

    const t = totalsRows[0] ?? { queries: 0, flagged: 0, watch: 0, clients: 0, domains: 0, last: null }
    const queries = t.queries ?? 0
    const prevQueries = Math.max(0, (prevRows[0]?.queries ?? 0) - queries)

    const attention: AttentionDomain[] = attnRows
      .map(r => {
        const risk: RiskLevel = riskOf({ type: r.type, action: r.blocked > 0 ? 'blocked' : undefined })
        return {
          domain: String(r._id),
          queries: r.queries as number,
          clients: r.clients as number,
          risk,
          blocked: r.blocked as number,
          type: (r.type as string) ?? '',
          group: (r.group as string) ?? '',
          aps: ((r.aps as (string | null)[]) ?? []).filter((a): a is string => Boolean(a)).sort(),
        }
      })
      .sort((a, b) => (a.risk === b.risk ? b.queries - a.queries : a.risk === 'flag' ? -1 : 1))
      .slice(0, 8)

    const body: OverviewData = {
      hours,
      bucket_ms: range.bucketMs,
      generated_at: new Date().toISOString(),
      last_event_at: iso(t.last),
      totals: {
        queries,
        prev_queries: prevQueries,
        flagged: t.flagged ?? 0,
        watch: t.watch ?? 0,
        clients: t.clients ?? 0,
        domains: t.domains ?? 0,
        active_now: activeNow.filter(Boolean).length,
      },
      series: fillSeries(
        seriesRows.filter(r => typeof r._id === 'number').map(r => ({ start: r._id as number, queries: r.queries, flagged: r.flagged })),
        hours,
        range.bucketMs,
        Date.now(),
      ),
      aps: apRows.map(r => ({
        ap_ip: String(r._id),
        label: (r.label as string) || String(r._id),
        queries: r.queries,
        clients: r.clients,
        flagged: r.flagged,
        last_seen: iso(r.last),
      })),
      top_domains: topRows.map(r => ({
        domain: String(r._id),
        queries: r.queries,
        clients: r.clients,
        risk: riskOf({ type: r.type, action: r.blocked > 0 ? 'blocked' : undefined }),
      })),
      attention,
      risky_clients: clientRows.map(r => ({
        client_ip: r._id.client,
        ap_ip: r._id.ap ?? '',
        ap_label: r.ap_label ?? '',
        queries: r.queries,
        domains: r.domains,
      })),
      blacklist: { active: blActive, total: blTotal },
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('Overview API Error:', error)
    return NextResponse.json({ error: 'Failed to load the overview' }, { status: 500 })
  }
}
