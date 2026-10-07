import { NextResponse } from 'next/server'
import { destroySession, isSecureRequest, readSessionToken } from '@/lib/auth'
import { SESSION_COOKIE } from '@/lib/auth-types'

export const dynamic = 'force-dynamic'

/** POST /api/auth/logout — hapus sesi di server dan kosongkan cookie. */
export async function POST(request: Request) {
  try {
    await destroySession(readSessionToken(request))
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
