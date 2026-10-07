import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import { isKnownType } from '@/lib/blacklist'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/blacklist/:id
 * Body (salah satu atau lebih): { is_active, type, group, description }
 * Domain tidak bisa diubah — hapus lalu tambah baru.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON' }, { status: 400 })
  }

  const set: Record<string, unknown> = {}
  if (typeof body.is_active === 'boolean') set.is_active = body.is_active
  if (typeof body.type === 'string') {
    if (!isKnownType(body.type)) return NextResponse.json({ error: 'Unknown category' }, { status: 400 })
    set.type = body.type
  }
  if (typeof body.group === 'string' && body.group.trim()) set.group = body.group.trim().slice(0, 80)
  if (typeof body.description === 'string') set.description = body.description.trim().slice(0, 300)
  if (Object.keys(set).length === 0) return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  set.updated_at = new Date()

  try {
    const db = await getDb()
    const res = await db.collection('dns_blacklist').updateOne({ _id: new ObjectId(id) }, { $set: set })
    if (res.matchedCount === 0) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[blacklist PATCH]', error)
    return NextResponse.json({ error: 'Failed to update the entry' }, { status: 500 })
  }
}

/** DELETE /api/blacklist/:id */
export async function DELETE(request: Request, { params }: Ctx) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const db = await getDb()
    const res = await db.collection('dns_blacklist').deleteOne({ _id: new ObjectId(id) })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[blacklist DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete the entry' }, { status: 500 })
  }
}
