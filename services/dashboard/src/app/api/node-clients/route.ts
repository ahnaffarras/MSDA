import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { intParam, riskOf, sinceFilter, worstRisk } from '@/lib/query'
import type { RiskLevel } from '@/lib/domain-risk'

/**
 * GET /api/node-clients?ap_ip=192.168.10.1&hours=24
 * Mendukung multiple IP dipisahkan koma: ?ap_ip=192.168.201.1,192.168.202.1
 */
export interface NodeClientDomain {
  domain: string
  count: number
  blocked: number
  group: string
  type: string
  risk: RiskLevel
  last_seen: string
}

export interface NodeClient {
  client_ip: string
  query_count: number
  blocked_count: number
  domain_count: number
  risk: RiskLevel
  last_seen: string
  last_domain: string
  domains: NodeClientDomain[]
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ''))

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const apIp = searchParams.get('ap_ip')
  const hours = intParam(searchParams.get('hours'), 24, 1, 24 * 90)

  if (!apIp) {
    return NextResponse.json({ error: 'ap_ip is required' }, { status: 400 })
  }

  try {
    const db = await getDb()

    // Mendukung multiple IP koma (misal: "192.168.201.1,192.168.202.1")
    const ips = apIp.split(',').map(s => s.trim()).filter(Boolean)
    const apFilter =
      ips.length > 1
        ? { $or: [{ 'ap_info.ip': { $in: ips } }, { ap_ip: { $in: ips } }] }
        : { $or: [{ 'ap_info.ip': ips[0] }, { ap_ip: ips[0] }] }

    // Satu baris per (client, domain) — jauh lebih kecil daripada event mentah
    const rows = await db
      .collection('ip_access_dns')
      .aggregate([
        { $match: { $and: [apFilter, sinceFilter(hours)] } },
        {
          $group: {
            _id: { client: '$client_ip', domain: '$domain' },
            count: { $sum: { $ifNull: ['$access_count', 1] } },
            blocked: { $sum: { $cond: [{ $eq: ['$action', 'blocked'] }, 1, 0] } },
            group: { $last: '$group' },
            type: { $last: '$type' },
            action: { $last: '$action' },
            last_seen: { $max: '$timestamp' },
          },
        },
        { $match: { '_id.client': { $nin: [null, ''] } } },
      ])
      .toArray()

    const byClient = new Map<string, NodeClient>()

    for (const r of rows) {
      const clientIp = r._id.client as string
      const risk = r.blocked > 0 ? 'flag' : riskOf({ type: r.type, action: r.action })
      const lastSeen = iso(r.last_seen)

      let client = byClient.get(clientIp)
      if (!client) {
        client = {
          client_ip: clientIp,
          query_count: 0,
          blocked_count: 0,
          domain_count: 0,
          risk: 'safe',
          last_seen: lastSeen,
          last_domain: r._id.domain,
          domains: [],
        }
        byClient.set(clientIp, client)
      }

      client.query_count += r.count
      client.blocked_count += r.blocked
      client.risk = worstRisk(client.risk, risk)
      if (lastSeen > client.last_seen) {
        client.last_seen = lastSeen
        client.last_domain = r._id.domain
      }
      client.domains.push({
        domain: r._id.domain,
        count: r.count,
        blocked: r.blocked,
        group: r.group ?? '',
        type: r.type ?? '',
        risk,
        last_seen: lastSeen,
      })
    }

    const clients = [...byClient.values()]
      .map(c => {
        c.domains.sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))
        c.domain_count = c.domains.length
        return c
      })
      .sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1))

    return NextResponse.json({ ap_ip: apIp, hours, clients })
  } catch (error) {
    console.error('Node Clients API Error:', error)
    return NextResponse.json({ ap_ip: apIp, hours, clients: [], error: 'Failed to fetch' }, { status: 500 })
  }
}
