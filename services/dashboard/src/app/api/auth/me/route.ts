import { NextResponse } from 'next/server'
import {
  authenticate,
  clearThrottle,
  hashPassword,
  lockedFor,
  passwordThrottleKey,
  recordUserFailure,
  revokeUserSessions,
  toPublicUser,
  usersCol,
  verifyPassword,
} from '@/lib/auth'
import { validatePassword } from '@/lib/auth-types'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** GET /api/auth/me — pengguna yang sedang login (dipakai untuk menjaga sesi tetap valid). */
export async function GET(request: Request) {
  try {
    const authed = await authenticate(request)
    if (!authed) return NextResponse.json({ error: 'Sign in required', code: 'auth_required' }, { status: 401, headers: NO_STORE })
    return NextResponse.json({ user: authed.user }, { headers: NO_STORE })
  } catch (error) {
    console.error('[auth me]', error)
    return NextResponse.json({ error: 'Could not check the session.' }, { status: 503, headers: NO_STORE })
  }
}

/**
 * PATCH /api/auth/me — ubah data akun sendiri.
 * Body: { currentPassword, newPassword } dan/atau { displayName }
 */
export async function PATCH(request: Request) {
  const authed = await authenticate(request)
  if (!authed) return NextResponse.json({ error: 'Sign in required', code: 'auth_required' }, { status: 401, headers: NO_STORE })

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400, headers: NO_STORE })
  }

  const set: Record<string, unknown> = {}

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.length > 60) {
      return NextResponse.json({ error: 'Name must be 1–60 characters.' }, { status: 400, headers: NO_STORE })
    }
    set.display_name = body.displayName.trim()
  }

  let passwordChanged = false
  if (body.newPassword !== undefined) {
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const next = typeof body.newPassword === 'string' ? body.newPassword : ''
    const key = passwordThrottleKey(authed.user.id)

    if ((await lockedFor(key)) > 0) {
      return NextResponse.json({ error: 'Too many wrong attempts. Try again in a few minutes.' }, { status: 429, headers: NO_STORE })
    }
    if (!current || !(await verifyPassword(current, authed.doc.password_hash))) {
      await recordUserFailure(key)
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400, headers: NO_STORE })
    }
    const problem = validatePassword(next, authed.user.username)
    if (problem) return NextResponse.json({ error: problem }, { status: 400, headers: NO_STORE })
    if (next === current) {
      return NextResponse.json({ error: 'The new password must be different from the current one.' }, { status: 400, headers: NO_STORE })
    }
    set.password_hash = await hashPassword(next)
    passwordChanged = true
    await clearThrottle(key)
  }

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: 'No changes provided.' }, { status: 400, headers: NO_STORE })
  }
  set.updated_at = new Date()

  try {
    const users = await usersCol()
    await users.updateOne({ _id: authed.doc._id }, { $set: set })
    // Ganti kata sandi → semua perangkat lain harus login ulang; sesi ini tetap hidup
    if (passwordChanged) await revokeUserSessions(authed.doc._id, authed.tokenHash)
    const fresh = await users.findOne({ _id: authed.doc._id })
    return NextResponse.json({ ok: true, user: fresh ? toPublicUser(fresh) : authed.user }, { headers: NO_STORE })
  } catch (error) {
    console.error('[auth me PATCH]', error)
    return NextResponse.json({ error: 'Failed to update the account.' }, { status: 500, headers: NO_STORE })
  }
}
