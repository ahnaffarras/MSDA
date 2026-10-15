import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { clientDetailHidden } from '@/lib/privacy-settings'
import { devicesCol, toDevice, upsertDevice } from '@/lib/client-devices-db'
import { validateDevice } from '@/lib/client-devices'
import { escapeRegex } from '@/lib/query'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const PAGE = 50

/** GET /api/client-devices?q=&page= — daftar label perangkat. Disembunyikan dari viewer bila privasi aktif. */
export async function GET(request: Request) {
  if (await clientDetailHidden(request)) {
    return NextResponse.json({ error: 'Client data is hidden for your role', code: 'hidden_for_role' }, { status: 403, headers: NO_STORE })
  }
  const sp = new URL(request.url).searchParams
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.get('page') ?? '1', 10) || 1))
  const q = (sp.get('q') ?? '').trim().slice(0, 100)
  const filter = q
    ? (() => {
        const rx = { $regex: escapeRegex(q), $options: 'i' }
        return { $or: [{ label: rx }, { ip: rx }, { hostname: rx }, { owner: rx }, { mac: rx }] }
      })()
    : {}
  try {
    const col = await devicesCol()
    const [total, docs] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter).sort({ label: 1, _id: 1 }).skip((page - 1) * PAGE).limit(PAGE).toArray(),
    ])
    return NextResponse.json(
      { data: docs.map(toDevice), meta: { page, limit: PAGE, total, total_pages: Math.max(1, Math.ceil(total / PAGE)) } },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error('[client-devices GET]', error)
    return NextResponse.json({ error: 'Failed to load client labels.' }, { status: 500, headers: NO_STORE })
  }
}

/** POST — admin. Body: { ip, label, mac?, hostname?, owner?, note? } (upsert). */
export async function POST(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400, headers: NO_STORE })
  }
  const v = validateDevice(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers: NO_STORE })
  try {
    const result = await upsertDevice(await devicesCol(), v.value, 'manual')
    await recordAudit({
      action: 'client_device.save',
      request,
      actor: actorOf(guard.user),
      targetType: 'client_device',
      targetId: v.value.ip,
      meta: { label: v.value.label, result },
    })
    return NextResponse.json({ ok: true, result }, { status: result === 'created' ? 201 : 200, headers: NO_STORE })
  } catch (error) {
    console.error('[client-devices POST]', error)
    return NextResponse.json({ error: 'Failed to save the label.' }, { status: 500, headers: NO_STORE })
  }
}
