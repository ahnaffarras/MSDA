import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { normalizeDomain } from '@/lib/blacklist'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

/** GET /api/allowlist — daftar domain yang selalu diizinkan (menang atas blocklist). */
export async function GET(request: Request) {
  if (!(await authenticate(request))) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  try {
    const docs = await (await getDb()).collection('dns_allowlist').find({}).sort({ domain: 1 }).limit(5000).toArray()
    return NextResponse.json(
      docs.map(d => ({ _id: String(d._id), domain: String(d.domain), note: String(d.note ?? ''), created_by: String(d.created_by ?? ''), created_at: d.created_at instanceof Date ? d.created_at.toISOString() : null })),
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error('[allowlist GET]', error)
    return NextResponse.json({ error: 'Failed to load the allowlist' }, { status: 500 })
  }
}

/** POST — admin. Body: { domain, note? }. `example.com` juga mencakup semua subdomainnya. */
export async function POST(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied
  let body: { domain?: unknown; note?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON' }, { status: 400 })
  }
  const domain = typeof body.domain === 'string' ? normalizeDomain(body.domain) : null
  if (!domain) return NextResponse.json({ error: 'Enter a valid domain, for example example.com' }, { status: 400 })
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : ''
  try {
    const col = (await getDb()).collection('dns_allowlist')
    if (await col.findOne({ domain })) return NextResponse.json({ error: 'This domain is already on the allowlist' }, { status: 409 })
    const res = await col.insertOne({ domain, note, created_by: guard.user.user.username, created_at: new Date() })
    await recordAudit({ action: 'allowlist.create', request, actor: actorOf(guard.user), targetType: 'allowlist', targetId: String(res.insertedId), meta: { domain } })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('[allowlist POST]', error)
    return NextResponse.json({ error: 'Failed to save the allowlist' }, { status: 500 })
  }
}
