import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { syncAdguard } from '@/lib/adguard'
import { checkEnforceable, isBlockMode, isHighImpact, parseNeverBlock } from '@/lib/enforce'

export const dynamic = 'force-dynamic'

/**
 * POST /api/blacklist/bulk   Body: { ids: string[] (maks. 200), action: 'enable' | 'disable' | 'delete' | 'set_mode', mode?: 'alert' | 'enforce' }
 * set_mode → 'enforce' melewati domain yang tidak boleh diblokir (public suffix / never-block) dan domain
 * populer/pendek (harus lewat dialog konfirmasi per entri); daftar yang dilewati dikembalikan di `skipped`.
 * Satu permintaan + satu baris audit, menggantikan loop satu-per-satu di browser.
 */
export async function POST(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  let body: { ids?: unknown; action?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON' }, { status: 400 })
  }
  const action = body.action
  if (action !== 'enable' && action !== 'disable' && action !== 'delete' && action !== 'set_mode') {
    return NextResponse.json({ error: 'action must be enable, disable, delete or set_mode' }, { status: 400 })
  }
  const mode = (body as { mode?: unknown }).mode
  if (action === 'set_mode' && !isBlockMode(mode)) {
    return NextResponse.json({ error: 'mode must be "alert" or "enforce"' }, { status: 400 })
  }
  const raw = Array.isArray(body.ids) ? body.ids : []
  if (raw.length === 0 || raw.length > 200 || !raw.every(i => typeof i === 'string' && ObjectId.isValid(i))) {
    return NextResponse.json({ error: 'ids must be 1–200 valid ids' }, { status: 400 })
  }
  const ids = raw.map(i => new ObjectId(i as string))

  try {
    const col = (await getDb()).collection('dns_blacklist')
    let affected = 0
    const skipped: { domain: string; reason: string }[] = []
    // Entri enforce yang ikut terdampak → butuh sinkronisasi AdGuard sesudahnya.
    let needsSync = (await col.countDocuments({ _id: { $in: ids }, block_mode: 'enforce' })) > 0

    if (action === 'set_mode') {
      if (mode === 'enforce') {
        const neverBlock = parseNeverBlock(process.env.MSDA_NEVER_BLOCK)
        const docs = await col.find({ _id: { $in: ids } }, { projection: { domain: 1 } }).toArray()
        const okIds: ObjectId[] = []
        for (const d of docs) {
          const domain = String(d.domain ?? '').toLowerCase()
          const chk = checkEnforceable(domain, neverBlock)
          if (!chk.ok) skipped.push({ domain, reason: chk.code })
          else if (isHighImpact(domain)) skipped.push({ domain, reason: 'needs_confirmation' })
          else okIds.push(d._id)
        }
        if (okIds.length) {
          affected = (await col.updateMany({ _id: { $in: okIds } }, { $set: { block_mode: 'enforce', enforce_status: 'pending', updated_at: new Date() } })).matchedCount
          needsSync = true
        }
      } else {
        affected = (await col.updateMany({ _id: { $in: ids } }, {
          $set: { block_mode: 'alert', updated_at: new Date() },
          $unset: { enforce_status: '', enforce_synced_at: '', enforce_error: '' },
        })).matchedCount
      }
    } else if (action === 'delete') affected = (await col.deleteMany({ _id: { $in: ids } })).deletedCount
    else affected = (await col.updateMany({ _id: { $in: ids } }, { $set: { is_active: action === 'enable', updated_at: new Date() } })).matchedCount

    await recordAudit({
      action: action === 'set_mode' ? 'blacklist.mode' : 'blacklist.bulk',
      request,
      actor: actorOf(guard.user),
      targetType: 'blacklist',
      meta: { action, ...(action === 'set_mode' ? { mode } : {}), requested: ids.length, affected, skipped: skipped.length },
    })
    let sync: string | undefined
    if (needsSync) sync = await syncAdguard(ids.map(i => i.toString()))
    return NextResponse.json({ ok: true, affected, skipped, ...(sync ? { sync } : {}) })
  } catch (error) {
    console.error('[blacklist bulk]', error)
    return NextResponse.json({ error: 'Failed to apply the bulk change' }, { status: 500 })
  }
}
