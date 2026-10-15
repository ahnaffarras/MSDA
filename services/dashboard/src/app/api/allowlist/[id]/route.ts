import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** DELETE /api/allowlist/:id — admin. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied
  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const col = (await getDb()).collection('dns_allowlist')
    const doc = await col.findOne({ _id: new ObjectId(id) })
    const res = await col.deleteOne({ _id: new ObjectId(id) })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    await recordAudit({ action: 'allowlist.delete', request, actor: actorOf(guard.user), targetType: 'allowlist', targetId: id, meta: { domain: doc?.domain } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[allowlist DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete the entry' }, { status: 500 })
  }
}
