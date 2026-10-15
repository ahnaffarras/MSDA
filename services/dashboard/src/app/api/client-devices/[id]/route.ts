import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { devicesCol } from '@/lib/client-devices-db'

export const dynamic = 'force-dynamic'

/** DELETE /api/client-devices/:id — admin. `id` = "mac:..." atau "ip:..." (URL-encoded). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied
  const { id } = await params
  const key = decodeURIComponent(id)
  if (!/^(mac|ip):[0-9A-Za-z:.\-]{3,60}$/.test(key)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const col = await devicesCol()
    const doc = await col.findOne({ _id: key })
    const res = await col.deleteOne({ _id: key })
    if (res.deletedCount === 0) return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    await recordAudit({
      action: 'client_device.delete',
      request,
      actor: actorOf(guard.user),
      targetType: 'client_device',
      targetId: doc?.ip ?? key,
      meta: { label: doc?.label },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[client-devices DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete the label.' }, { status: 500 })
  }
}
