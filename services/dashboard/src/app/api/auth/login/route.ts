import { NextResponse } from 'next/server'
import {
  SESSION_MAX_AGE_S,
  burnPasswordCheck,
  clearThrottle,
  clientIp,
  createSession,
  ensureBootstrapAdmin,
  ipThrottleKey,
  isSecureRequest,
  lockedFor,
  normalizeUsername,
  recordIpFailure,
  recordUserFailure,
  userThrottleKey,
  usersCol,
  verifyPassword,
  toPublicUser,
} from '@/lib/auth'
import { PASSWORD_MAX, SESSION_COOKIE } from '@/lib/auth-types'
import { recordAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const BAD = 'Incorrect username or password.'

/** POST /api/auth/login   Body: { username, password } */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
    body = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Request body is not valid JSON.' }, { status: 400, headers: NO_STORE })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  const username = normalizeUsername(body.username)
  if (typeof body.username !== 'string' || !body.username.trim() || !password) {
    return NextResponse.json({ error: 'Enter your username and password.' }, { status: 400, headers: NO_STORE })
  }
  if (password.length > PASSWORD_MAX) {
    return NextResponse.json({ error: BAD }, { status: 401, headers: NO_STORE })
  }

  try {
    await ensureBootstrapAdmin()

    const ip = clientIp(request)
    // username yang bentuknya tidak valid tetap dihitung agar tidak bisa dipakai menebak
    const uKey = userThrottleKey(username ?? `invalid:${String(body.username).slice(0, 32).toLowerCase()}`)
    const iKey = ipThrottleKey(ip)

    const wait = Math.max(await lockedFor(uKey), await lockedFor(iKey))
    if (wait > 0) {
      const mins = Math.ceil(wait / 60)
      await recordAudit({ action: 'auth.login_locked', request, actor: { username }, meta: { retry_after_s: wait } })
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, retryAfter: wait },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': String(wait) } },
      )
    }

    const users = await usersCol()
    const doc = username ? await users.findOne({ username }) : null
    // Selalu jalankan satu pemeriksaan hash supaya waktu respons tidak membocorkan keberadaan akun
    const ok = doc ? await verifyPassword(password, doc.password_hash) : await burnPasswordCheck(password)

    if (!doc || !ok || !doc.is_active) {
      await Promise.all([recordUserFailure(uKey), recordIpFailure(iKey)])
      // Hanya username berbentuk valid yang dicatat: orang kadang salah mengetik password di kolom username.
      await recordAudit({
        action: 'auth.login_failed',
        request,
        actor: { username },
        meta: { reason: !doc ? 'unknown_user' : !ok ? 'bad_password' : 'inactive', username_format_valid: username !== null },
      })
      return NextResponse.json({ error: BAD }, { status: 401, headers: NO_STORE })
    }

    const { token, expiresAt } = await createSession(doc._id, {
      ip,
      userAgent: request.headers.get('user-agent') ?? '',
    })
    await Promise.all([
      clearThrottle(uKey),
      users.updateOne({ _id: doc._id }, { $set: { last_login_at: new Date(), last_login_ip: ip } }),
    ])

    await recordAudit({ action: 'auth.login', request, actor: { id: doc._id.toString(), username: doc.username } })

    const res = NextResponse.json({ user: toPublicUser(doc) }, { headers: NO_STORE })
    res.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: isSecureRequest(request),
      path: '/',
      maxAge: SESSION_MAX_AGE_S,
      expires: expiresAt,
    })
    return res
  } catch (error) {
    console.error('[auth login]', error)
    return NextResponse.json({ error: 'Sign-in is unavailable right now. Please try again.' }, { status: 503, headers: NO_STORE })
  }
}
