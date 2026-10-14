import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { adminProtected, requireAdmin } from '@/lib/admin'
import { sinceFilter } from '@/lib/query'
import {
  BLACKLIST_TYPES,
  isKnownType,
  matchesBlacklist,
  normalizeDomain,
  type BlacklistEntry,
} from '@/lib/blacklist'

const iso = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString()
  return typeof v === 'string' && v ? v : null
}

/**
 * GET /api/blacklist
 * Semua entri daftar blokir + berapa kali domain itu masih diakses 7 hari terakhir.
 * Entri lama dari seed n8n tidak punya `is_active`; dianggap aktif.
 */
export async function GET() {
  try {
    const db = await getDb()
    const docs = await db.collection('dns_blacklist').find({}).sort({ type: 1, domain: 1 }).toArray()

    // hits per domain (satu agregasi), lalu dicocokkan ke tiap entri termasuk subdomain
    const hitRows = await db
      .collection('ip_access_dns')
      .aggregate([
        { $match: sinceFilter(24 * 7) },
        { $group: { _id: '$domain', n: { $sum: { $ifNull: ['$access_count', 1] } }, last: { $max: '$timestamp' } } },
      ])
      .toArray()

    const entries: BlacklistEntry[] = docs
      .filter(d => typeof d.domain === 'string' && d.domain.trim() !== '')
      .map(d => {
        let hits = 0
        let last: string | null = null
        for (const r of hitRows) {
          if (typeof r._id === 'string' && matchesBlacklist(r._id, d.domain)) {
            hits += r.n
            const t = iso(r.last)
            if (t && (!last || t > last)) last = t
          }
        }
        return {
          _id: d._id.toString(),
          domain: d.domain,
          group: d.group || BLACKLIST_TYPES.find(t => t.value === d.type)?.group || 'Kustom',
          type: d.type || 'custom',
          description: d.description || '',
          is_active: d.is_active !== false,
          created_at: iso(d.created_at) ?? iso(d.created),
          hits_7d: hits,
          last_hit: last,
        }
      })

    return NextResponse.json(entries, {
      headers: {
        'x-msda-admin-protected': adminProtected() ? '1' : '0',
      },
    })
  } catch (error) {
    console.error('[blacklist GET]', error)
    return NextResponse.json({ error: 'Failed to load the blocklist' }, { status: 500 })
  }
}

/**
 * POST /api/blacklist
 * Body: { domains: string[] | domain: string, type?: string, group?: string, description?: string }
 * Menambah satu atau beberapa domain sekaligus. Domain yang sudah ada dilewati.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON' }, { status: 400 })
  }

  const rawList: string[] = Array.isArray(body.domains)
    ? body.domains.map(String)
    : typeof body.domain === 'string'
      ? [body.domain]
      : []
  if (rawList.length === 0) {
    return NextResponse.json({ error: 'domain is required' }, { status: 400 })
  }
  if (rawList.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 domains per request' }, { status: 400 })
  }

  const type = typeof body.type === 'string' && body.type ? body.type : 'custom'
  if (!isKnownType(type)) {
    return NextResponse.json({ error: `Unknown category: ${type}` }, { status: 400 })
  }
  const defaultGroup = BLACKLIST_TYPES.find(t => t.value === type)?.group ?? 'Kustom'
  const group = (typeof body.group === 'string' && body.group.trim()) || defaultGroup
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 300) : ''

  try {
    const db = await getDb()
    const col = db.collection('dns_blacklist')

    const created: string[] = []
    const skipped: { input: string; reason: 'invalid' | 'exists' | 'duplicate_input' }[] = []
    const seen = new Set<string>()

    for (const input of rawList) {
      const domain = normalizeDomain(input)
      if (!domain) {
        skipped.push({ input, reason: 'invalid' })
        continue
      }
      if (seen.has(domain)) {
        skipped.push({ input, reason: 'duplicate_input' })
        continue
      }
      seen.add(domain)

      const exists = await col.findOne({ domain })
      if (exists) {
        skipped.push({ input: domain, reason: 'exists' })
        continue
      }

      const now = new Date()
      await col.insertOne({
        domain,
        group,
        type,
        description,
        blocked_level: 'domain',
        is_active: true,
        created_by: 'dashboard',
        created_at: now,
        updated_at: now,
      })
      created.push(domain)
    }

    const status = created.length > 0 ? 201 : skipped.some(s => s.reason === 'exists') ? 409 : 400
    return NextResponse.json({ created, skipped }, { status })
  } catch (error) {
    console.error('[blacklist POST]', error)
    return NextResponse.json({ error: 'Failed to save the blocklist' }, { status: 500 })
  }
}
