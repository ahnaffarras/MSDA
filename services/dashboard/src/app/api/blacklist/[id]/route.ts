import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { isKnownType, parseExpiry } from '@/lib/blacklist'
import { syncAdguard } from '@/lib/adguard'
import { checkEnforceable, isBlockMode, isHighImpact, parseNeverBlock } from '@/lib/enforce'

type Ctx = { params: Promise<{ id: string }> }
type Existing = { domain?: string; block_mode?: string }

async function loadExisting(id: string): Promise<Existing | null> {
  const doc = await (await getDb()).collection('dns_blacklist').findOne({ _id: new ObjectId(id) }, { projection: { domain: 1, block_mode: 1 } })
  return doc ? { domain: doc.domain as string | undefined, block_mode: doc.block_mode as string | undefined } : null
}

/**
 * PATCH /api/blacklist/:id
 * Body (salah satu atau lebih): { is_active, type, group, description, note, expires_at (YYYY-MM-DD | null),
 *   block_mode ('alert' | 'enforce'), include_subdomains, confirm_domain }
 * Mengubah ke 'enforce' memvalidasi domain (public suffix / never-block) dan, untuk domain populer/pendek,
 * mewajibkan confirm_domain = domainnya.
 * Domain tidak bisa diubah — hapus lalu tambah baru.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON' }, { status: 400 })
  }

  const set: Record<string, unknown> = {}
  const unset: Record<string, ''> = {}
  let existing: Existing | null
  try {
    existing = await loadExisting(id)
  } catch (error) {
    console.error('[blacklist PATCH lookup]', error)
    return NextResponse.json({ error: 'Failed to update the entry' }, { status: 500 })
  }
  if (!existing) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  if ('block_mode' in body) {
    if (!isBlockMode(body.block_mode)) return NextResponse.json({ error: 'block_mode must be "alert" or "enforce"' }, { status: 400 })
    if (body.block_mode === 'enforce') {
      const domain = String(existing.domain ?? '').toLowerCase()
      const chk = checkEnforceable(domain, parseNeverBlock(process.env.MSDA_NEVER_BLOCK))
      if (!chk.ok) return NextResponse.json({ error: chk.message, code: chk.code }, { status: 400 })
      if (isHighImpact(domain) && body.confirm_domain !== domain) {
        return NextResponse.json(
          { error: `This domain is widely used or very short. Type "${domain}" to confirm blocking it and all its subdomains.`, code: 'confirm_required' },
          { status: 400 },
        )
      }
      set.block_mode = 'enforce'
      set.enforce_status = 'pending'
    } else {
      set.block_mode = 'alert'
      unset.enforce_status = ''
      unset.enforce_synced_at = ''
      unset.enforce_error = ''
    }
  }
  if (typeof body.include_subdomains === 'boolean') set.include_subdomains = body.include_subdomains
  if (typeof body.is_active === 'boolean') set.is_active = body.is_active
  if (typeof body.type === 'string') {
    if (!isKnownType(body.type)) return NextResponse.json({ error: 'Unknown category' }, { status: 400 })
    set.type = body.type
  }
  if (typeof body.group === 'string' && body.group.trim()) set.group = body.group.trim().slice(0, 80)
  if (typeof body.description === 'string') set.description = body.description.trim().slice(0, 300)
  if (typeof body.note === 'string') set.note = body.note.trim().slice(0, 300)
  if ('expires_at' in body) {
    const exp = parseExpiry(body.expires_at)
    if (exp === 'invalid') return NextResponse.json({ error: 'expires_at must be a date like 2026-12-31' }, { status: 400 })
    if (exp && exp.getTime() <= Date.now()) return NextResponse.json({ error: 'expires_at must be in the future' }, { status: 400 })
    set.expires_at = exp
  }
  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  set.updated_at = new Date()

  try {
    const db = await getDb()
    const res = await db
      .collection('dns_blacklist')
      .updateOne({ _id: new ObjectId(id) }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) })
    if (res.matchedCount === 0) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    const keys = Object.keys(set).filter(k => k !== 'updated_at')
    await recordAudit({
      action: 'block_mode' in set ? 'blacklist.mode' : keys.length === 1 && keys[0] === 'is_active' ? 'blacklist.toggle' : 'blacklist.update',
      request,
      actor: actorOf(guard.user),
      targetType: 'blacklist',
      targetId: id,
      meta: { domain: existing.domain, ...Object.fromEntries(keys.map(k => [k, set[k]])) },
    })
    // Sinkronkan AdGuard bila entri ini (pernah) berstatus enforce.
    let sync: string | undefined
    if (existing.block_mode === 'enforce' || set.block_mode === 'enforce') sync = await syncAdguard([id])
    return NextResponse.json({ ok: true, ...(sync ? { sync } : {}) })
  } catch (error) {
    console.error('[blacklist PATCH]', error)
    return NextResponse.json({ error: 'Failed to update the entry' }, { status: 500 })
  }
}

/** DELETE /api/blacklist/:id */
export async function DELETE(request: Request, { params }: Ctx) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const db = await getDb()
    const existing = await db.collection('dns_blacklist').findOne({ _id: new ObjectId(id) }, { projection: { domain: 1, type: 1, block_mode: 1 } })
    const res = await db.collection('dns_blacklist').deleteOne({ _id: new ObjectId(id) })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    await recordAudit({
      action: 'blacklist.delete',
      request,
      actor: actorOf(guard.user),
      targetType: 'blacklist',
      targetId: id,
      meta: { domain: existing?.domain, type: existing?.type },
    })
    let sync: string | undefined
    if (existing?.block_mode === 'enforce') sync = await syncAdguard()
    return NextResponse.json({ ok: true, ...(sync ? { sync } : {}) })
  } catch (error) {
    console.error('[blacklist DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete the entry' }, { status: 500 })
  }
}
