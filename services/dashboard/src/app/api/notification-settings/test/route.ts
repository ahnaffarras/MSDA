import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/admin'
import { actorOf, recordAudit } from '@/lib/audit'
import { CHANNELS, type Channel } from '@/lib/notification-settings'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * POST /api/notification-settings/test   Body: { channel: 'slack' | 'telegram', message? }
 * Meneruskan { channel, message, requested_by } ke webhook n8n (env N8N_TEST_NOTIFY_URL).
 * Workflow penerimanya dibuat di sisi n8n; token bot/Slack tetap hanya ada di n8n.
 */
export async function POST(request: Request) {
  const guard = await guardAdmin(request)
  if (guard.denied) return guard.denied

  const url = process.env.N8N_TEST_NOTIFY_URL
  if (!url) {
    return NextResponse.json(
      { error: 'Test notifications are not configured (N8N_TEST_NOTIFY_URL is empty).', code: 'not_configured' },
      { status: 501, headers: NO_STORE },
    )
  }

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400, headers: NO_STORE })
  }
  const channel = body.channel
  if (typeof channel !== 'string' || !CHANNELS.includes(channel as Channel)) {
    return NextResponse.json({ error: 'Choose a channel (slack or telegram).' }, { status: 400, headers: NO_STORE })
  }
  const message =
    typeof body.message === 'string' && body.message.trim()
      ? body.message.trim().slice(0, 300)
      : 'MSDA test notification: if you can read this, the channel works.'

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (process.env.MSDA_WEBHOOK_TOKEN) headers['X-MSDA-Token'] = process.env.MSDA_WEBHOOK_TOKEN

  let ok = false
  let status = 0
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ channel, message, requested_by: guard.user.user.username }),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
    ok = res.ok
    status = res.status
  } catch (error) {
    console.error('[notification-settings test] n8n unreachable', error)
  }

  await recordAudit({
    action: 'notification_settings.test',
    request,
    actor: actorOf(guard.user),
    targetType: 'notification_settings',
    targetId: channel,
    meta: { ok, status },
  })

  if (!ok) {
    return NextResponse.json(
      { error: status ? `n8n answered with status ${status}.` : 'n8n is not reachable.', code: 'delivery_failed' },
      { status: 502, headers: NO_STORE },
    )
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
