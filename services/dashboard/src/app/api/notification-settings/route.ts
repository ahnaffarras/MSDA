import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { guardAdmin } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { actorOf, recordAudit } from '@/lib/audit'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  parseNotificationSettings,
  type NotificationSettings,
} from '@/lib/notification-settings'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
type SettingsDoc = { _id: string; [k: string]: unknown }

async function load(): Promise<NotificationSettings> {
  const col = (await getDb()).collection<SettingsDoc>('notification_settings')
  const doc = await col.findOne({ _id: 'global' })
  if (!doc) return DEFAULT_NOTIFICATION_SETTINGS
  const updatedAt = doc.updated_at instanceof Date ? doc.updated_at.toISOString() : null
  // Gabungkan dengan default supaya dokumen yang belum lengkap tetap valid
  const merged = {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(doc as unknown as Partial<NotificationSettings>),
    updated_at: updatedAt,
  }
  return merged
}

/** GET — semua pengguna yang login boleh melihat. `test_available` = URL n8n untuk tombol "Kirim tes" sudah diatur. */
export async function GET(request: Request) {
  const authed = await authenticate(request)
  if (!authed) return NextResponse.json({ error: 'Sign in required', code: 'auth_required' }, { status: 401, headers: NO_STORE })
  try {
    return NextResponse.json(
      { settings: await load(), test_available: Boolean(process.env.N8N_TEST_NOTIFY_URL), can_edit: authed.user.role === 'admin' },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error('[notification-settings GET]', error)
    return NextResponse.json({ error: 'Failed to load notification settings.' }, { status: 500, headers: NO_STORE })
  }
}

/** PUT — khusus administrator. Body: lihat parseNotificationSettings. */
export async function PUT(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400, headers: NO_STORE })
  }
  const parsed = parseNotificationSettings(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE })

  try {
    const col = (await getDb()).collection<SettingsDoc>('notification_settings')
    const now = new Date()
    await col.replaceOne(
      { _id: 'global' },
      { _id: 'global', ...parsed.value, updated_by: guard.user.user.username, updated_at: now },
      { upsert: true },
    )
    await recordAudit({
      action: 'notification_settings.update',
      request,
      actor: actorOf(guard.user),
      targetType: 'notification_settings',
      targetId: 'global',
      meta: { settings: parsed.value },
    })
    return NextResponse.json({ settings: await load() }, { headers: NO_STORE })
  } catch (error) {
    console.error('[notification-settings PUT]', error)
    return NextResponse.json({ error: 'Failed to save notification settings.' }, { status: 500, headers: NO_STORE })
  }
}
