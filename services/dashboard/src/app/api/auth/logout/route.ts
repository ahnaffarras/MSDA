import { NextResponse } from 'next/server'
import { authenticate, destroySession, isSecureRequest, readSessionToken } from '@/lib/auth'
import { actorOf, recordAudit } from '@/lib/audit'
import { SESSION_COOKIE } from '@/lib/auth-types'

export const dynamic = 'force-dynamic'

/** POST /api/auth/logout — hapus sesi di server dan kosongkan cookie. */
export async function POST(request: Request) {
  try {
    const authed = await authenticate(request).catch(() => null) // sebelum sesi dihapus
    await destroySession(readSessionToken(request))
    if (authed) await recordAudit({ action: 'auth.logout', request, actor: actorOf(authed) })
  } catch (error) {
    console.error('[auth logout]', error)
  }
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: 0,
  })
  return res
}
