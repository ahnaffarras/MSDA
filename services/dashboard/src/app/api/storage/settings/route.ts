import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { parseSettingsPatch } from '@/lib/storage-config'
import { getOverview, saveSettings } from '@/lib/storage-service'

export const dynamic = 'force-dynamic'

/**
 * PUT /api/storage/settings   (khusus administrator)
 * Body: { global?: {...}, policies?: { [koleksi]: { enabled?, retentionDays?, intervalDays? } } }
 * Hanya koleksi di daftar CLEANABLE yang diterima; nilai di luar batas ditolak (400).
 */
export async function PUT(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 })
  }

  const parsed = parseSettingsPatch(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const db = await getDb()
    const saved = await saveSettings(db, parsed.value)
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 })
    await recordAudit({ action: 'storage.settings_update', request, actor: actorOf(guard.user), targetType: 'storage', meta: { patch: parsed.value } })
    return NextResponse.json(await getOverview(db))
  } catch (error) {
    console.error('Failed to save storage settings:', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
