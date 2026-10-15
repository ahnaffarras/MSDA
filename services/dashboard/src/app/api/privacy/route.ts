import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { getPrivacySettings, savePrivacySettings } from '@/lib/privacy-settings'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

/** GET — pengguna yang login boleh melihat status. */
export async function GET(request: Request) {
  const authed = await authenticate(request)
  if (!authed) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers: NO_STORE })
  return NextResponse.json({ settings: await getPrivacySettings(true) }, { headers: NO_STORE })
}

/** PUT { mask_viewer_ips: boolean } — khusus administrator. */
export async function PUT(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400, headers: NO_STORE })
  }
  const v = (body as { mask_viewer_ips?: unknown } | null)?.mask_viewer_ips
  if (typeof v !== 'boolean') return NextResponse.json({ error: 'mask_viewer_ips must be true or false.' }, { status: 400, headers: NO_STORE })
  try {
    const settings = await savePrivacySettings(v, guard.user.user.username)
    await recordAudit({ action: 'privacy.update', request, actor: actorOf(guard.user), targetType: 'privacy', targetId: 'privacy', meta: { mask_viewer_ips: v } })
    return NextResponse.json({ settings }, { headers: NO_STORE })
  } catch (error) {
    console.error('[privacy PUT]', error)
    return NextResponse.json({ error: 'Failed to save privacy settings.' }, { status: 500, headers: NO_STORE })
  }
}
