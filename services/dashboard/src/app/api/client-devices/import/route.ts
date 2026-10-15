import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { devicesCol, upsertDevice } from '@/lib/client-devices-db'
import { IMPORT_MAX_BYTES, parseDevicesCsv } from '@/lib/client-devices'

export const dynamic = 'force-dynamic'

/**
 * POST /api/client-devices/import — admin. Body JSON: { csv: "ip,label,mac,hostname,owner,note\n..." }
 * Baris yang tidak valid dilewati dan dilaporkan dengan nomor barisnya; baris valid tetap diimpor.
 */
export async function POST(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied
  let csv: unknown
  try {
    csv = ((await request.json()) as { csv?: unknown })?.csv
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400 })
  }
  if (typeof csv !== 'string' || csv.length > IMPORT_MAX_BYTES) {
    return NextResponse.json({ error: 'Provide the CSV text in "csv" (maximum 1 MB).' }, { status: 400 })
  }
  const parsed = parseDevicesCsv(csv)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const col = await devicesCol()
    let created = 0
    let updated = 0
    for (const d of parsed.value.devices) {
      if ((await upsertDevice(col, d, 'csv')) === 'created') created++
      else updated++
    }
    await recordAudit({
      action: 'client_device.import',
      request,
      actor: actorOf(guard.user),
      targetType: 'client_device',
      meta: { created, updated, rejected: parsed.value.errors.length },
    })
    return NextResponse.json({ created, updated, errors: parsed.value.errors.slice(0, 50), error_count: parsed.value.errors.length })
  } catch (error) {
    console.error('[client-devices import]', error)
    return NextResponse.json({ error: 'Failed to import the labels.' }, { status: 500 })
  }
}
