import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth-types'
import { validateSessionToken } from '@/lib/auth'

/**
 * Gerbang login untuk seluruh dashboard (Next.js 16: `proxy.ts` menggantikan `middleware.ts`).
 *
 * - Semua halaman dan /api/* butuh sesi yang valid, kecuali halaman login dan endpoint login/logout.
 * - Sesi diperiksa ke database setiap request, jadi akun yang dinonaktifkan/dihapus langsung
 *   kehilangan akses.
 * - Permintaan tulis (POST/PUT/PATCH/DELETE) dari browser harus berasal dari origin yang sama
 *   (perlindungan CSRF tambahan di atas SameSite=Lax).
 */

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout'])
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const isApi = (p: string) => p === '/api' || p.startsWith('/api/') || p.startsWith('/api-proxy/')

function allowedHosts(request: NextRequest): Set<string> {
  const hosts = new Set<string>()
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host) hosts.add(host.split(',')[0].trim().toLowerCase())
  for (const h of (process.env.SATA_ALLOWED_ORIGINS ?? '').split(',')) {
    const v = h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    if (v) hosts.add(v)
  }
  return hosts
}

function crossSite(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      return !allowedHosts(request).has(new URL(origin).host.toLowerCase())
    } catch {
      return true
    }
  }
  return request.headers.get('sec-fetch-site') === 'cross-site'
}

const json = (error: string, code: string, status: number) =>
  NextResponse.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (UNSAFE.has(request.method) && isApi(pathname) && crossSite(request)) {
    return json('Cross-site request blocked', 'csrf', 403)
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value

  let authed: Awaited<ReturnType<typeof validateSessionToken>> = null
  if (token) {
    try {
      authed = await validateSessionToken(token)
    } catch (error) {
      console.error('[proxy] session check failed', error)
      return isApi(pathname)
        ? json('Authentication service unavailable', 'auth_unavailable', 503)
        : new NextResponse('Authentication service unavailable. Please retry in a moment.', { status: 503 })
    }
  }

  if (PUBLIC_PATHS.has(pathname)) {
    // Sudah login lalu membuka /login → langsung ke dashboard
    if (authed && pathname === '/login') return NextResponse.redirect(new URL('/', request.url))
    return NextResponse.next()
  }

  if (!authed) {
    if (isApi(pathname)) {
      const res = json('Sign in required', 'auth_required', 401)
      if (token) res.cookies.delete(SESSION_COOKIE)
      return res
    }
    const login = new URL('/login', request.url)
    if (pathname !== '/') login.searchParams.set('next', pathname + search)
    const res = NextResponse.redirect(login)
    if (token) res.cookies.delete(SESSION_COOKIE) // sesi kedaluwarsa / dicabut
    return res
  }

  // Halaman manajemen pengguna hanya untuk administrator
  if ((pathname === '/users' || pathname.startsWith('/users/')) && authed.user.role !== 'admin') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
