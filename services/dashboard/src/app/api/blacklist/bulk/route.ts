import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/blacklist/bulk   Body: { ids: string[] (maks. 200), action: 'enable' | 'disable' | 'delete' }
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
  if (action !== 'enable' && action !== 'disable' && action !== 'delete') {
    return NextResponse.json({ error: 'action must be enable, disable or delete' }, { status: 400 })
  }
  const raw = Array.isArray(body.ids) ? body.ids : []
  if (raw.length === 0 || raw.length > 200 || !raw.every(i => typeof i === 'string' && ObjectId.isValid(i))) {
    return NextResponse.json({ error: 'ids must be 1–200 valid ids' }, { status: 400 })
  }
  const ids = raw.map(i => new ObjectId(i as string))

  try {
    const col = (await getDb()).collection('dns_blacklist')
    let affected = 0
    if (action === 'delete') affected = (await col.deleteMany({ _id: { $in: ids } })).deletedCount
    else affected = (await col.updateMany({ _id: { $in: ids } }, { $set: { is_active: action === 'enable', updated_at: new Date() } })).matchedCount

    await recordAudit({ action: 'blacklist.bulk', request, actor: actorOf(guard.user), targetType: 'blacklist', meta: { action, requested: ids.length, affected } })
    return NextResponse.json({ ok: true, affected })
  } catch (error) {
    console.error('[blacklist bulk]', error)
    return NextResponse.json({ error: 'Failed to apply the bulk change' }, { status: 500 })
  }
}
