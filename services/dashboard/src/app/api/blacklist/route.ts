import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { adminProtected, guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { addBlocklistEntries, isAllowlisted, loadAllowlist } from '@/lib/blocklist-db'
import { syncAdguard } from '@/lib/adguard'
import { isBlockMode } from '@/lib/enforce'
import { sinceFilter } from '@/lib/query'
import {
  BLACKLIST_SOURCES,
  BLACKLIST_TYPES,
  isKnownType,
  matchesBlacklist,
  parseExpiry,
  type BlacklistEntry,
  type BlacklistSource,
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
    const docs = await db.collection('dns_blacklist').find({}).sort({ type: 1, domain: 1 }).limit(20_000).toArray()
    const allow = await loadAllowlist(db)

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
          expires_at: iso(d.expires_at),
          source: typeof d.source === 'string' && d.source ? d.source : 'manual',
          note: typeof d.note === 'string' ? d.note : '',
          allowlisted: isAllowlisted(d.domain, allow),
          block_mode: d.block_mode === 'enforce' ? 'enforce' : 'alert',
          include_subdomains: d.include_subdomains !== false,
          ...(d.block_mode === 'enforce'
            ? {
                enforce_status: ['pending', 'synced', 'error'].includes(d.enforce_status) ? d.enforce_status : 'pending',
                enforce_error: typeof d.enforce_error === 'string' ? d.enforce_error : '',
                enforce_synced_at: iso(d.enforce_synced_at),
              }
            : {}),
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
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

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
    const parsedExpiry = parseExpiry(body.expires_at)
    if (parsedExpiry === 'invalid') {
      return NextResponse.json({ error: 'expires_at must be a date like 2026-12-31' }, { status: 400 })
    }
    if (parsedExpiry && parsedExpiry.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'expires_at must be in the future' }, { status: 400 })
    }
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    const source = BLACKLIST_SOURCES.includes(body.source as never) ? (body.source as BlacklistSource) : 'manual'

    if (body.block_mode !== undefined && !isBlockMode(body.block_mode)) {
      return NextResponse.json({ error: 'block_mode must be "alert" or "enforce"' }, { status: 400 })
    }
    const block_mode = body.block_mode === 'enforce' ? 'enforce' : 'alert'
    const include_subdomains = body.include_subdomains === false ? false : undefined

    const { created, createdIds, skipped } = await addBlocklistEntries(
      db,
      rawList.map(input => ({ input, type, group, description, note, expires_at: parsedExpiry, source, block_mode, include_subdomains })),
      // Hanya dari preset yang daftarnya sudah ditampilkan & dikonfirmasi admin di UI.
      { allowHighImpact: body.confirm_high_impact === true },
    )

    if (created.length > 0) {
      await recordAudit({
        action: 'blacklist.create',
        request,
        actor: actorOf(guard.user),
        targetType: 'blacklist',
        meta: { count: created.length, domains: created.slice(0, 20), type, group, block_mode },
      })
      if (block_mode === 'enforce') await syncAdguard(createdIds)
    }

    const status = created.length > 0 ? 201 : skipped.some(s => s.reason === 'exists' || s.reason === 'allowlisted' || s.reason === 'not_enforceable' || s.reason === 'needs_confirmation') ? 409 : 400
    return NextResponse.json({ created, skipped }, { status })
  } catch (error) {
    console.error('[blacklist POST]', error)
    return NextResponse.json({ error: 'Failed to save the blocklist' }, { status: 500 })
  }
}
