import { NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { actorOf, recordAudit } from '@/lib/audit'
import { getPrivacySettings } from '@/lib/privacy-settings'
import { maskIp } from '@/lib/privacy'

/**
 * Proxy ke backend Go: /api-proxy/<path>  →  <MSDA_BACKEND_URL>/api/<path>
 *
 * Menggantikan rewrite lama di next.config.ts yang meneruskan request apa adanya tanpa
 * identitas (backend lalu terbuka untuk siapa saja yang bisa menjangkaunya). Sekarang:
 *   1. Sesi login dashboard WAJIB valid (cookie HttpOnly diperiksa ke database).
 *   2. Method selain GET/HEAD hanya untuk administrator (peran `viewer` = baca saja).
 *   3. Request diteruskan dengan header rahasia X-Internal-Token (env MSDA_INTERNAL_TOKEN)
 *      yang hanya diketahui server ini dan backend, plus X-MSDA-User untuk jejak "siapa".
 *   4. Cookie/Authorization browser TIDAK diteruskan ke backend.
 *   5. Respons di-stream apa adanya (siap untuk SSE).
 *
 * Perlindungan CSRF (origin sama) untuk method tulis sudah ditangani src/proxy.ts.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Ctx = { params: Promise<{ path: string[] }> }

const NO_STORE = { 'Cache-Control': 'no-store' }
const MAX_BODY_BYTES = 1_000_000
const TIMEOUT_MS = 30_000
const READ_METHODS = new Set(['GET', 'HEAD'])
// Header respons backend yang boleh diteruskan ke browser
const PASS_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'content-language', 'etag']

const backendBase = () =>
  (process.env.MSDA_BACKEND_URL ?? 'http://localhost:8080').replace(/\/+$/, '')

const fail = (error: string, code: string, status: number) =>
  NextResponse.json({ error, code }, { status, headers: NO_STORE })

/** Aksi notifikasi yang dicatat ke audit log (hanya yang mengubah data). */
function auditFor(method: string, segments: string[], body: string) {
  if (READ_METHODS.has(method)) return null
  // segments contoh: ['v1','notifications',<id>,'status'] | ['v1','notifications','bulk-status'] | ['v1','notifications','read-all']
  if (segments[0] !== 'v1' || segments[1] !== 'notifications') return null
  let parsed: Record<string, unknown> = {}
  try {
    const p: unknown = body ? JSON.parse(body) : {}
    if (typeof p === 'object' && p !== null && !Array.isArray(p)) parsed = p as Record<string, unknown>
  } catch {
    /* body bukan JSON: dicatat tanpa detail */
  }
  const last = segments[segments.length - 1]
  if (last === 'read-all') return { action: 'notification.read_all' as const, targetId: undefined, meta: {} }
  if (last === 'bulk-status') {
    const ids = Array.isArray(parsed.ids) ? parsed.ids : []
    return {
      action: 'notification.bulk_status' as const,
      targetId: undefined,
      meta: { status: parsed.status, count: ids.length, note: parsed.note },
    }
  }
  if (last === 'status' || last === 'read') {
    return {
      action: 'notification.status' as const,
      targetId: segments[2],
      meta: { status: last === 'read' ? 'acknowledged' : parsed.status, note: parsed.note },
    }
  }
  return null
}

async function handle(request: Request, { params }: Ctx): Promise<Response> {
  let authed
  try {
    authed = await authenticate(request)
  } catch (error) {
    console.error('[api-proxy] session check failed', error)
    return fail('Authentication service unavailable', 'auth_unavailable', 503)
  }
  if (!authed) return fail('Sign in required', 'auth_required', 401)

  const method = request.method.toUpperCase()
  if (!READ_METHODS.has(method) && authed.user.role !== 'admin') {
    return fail('Administrator access required', 'admin_required', 403)
  }

  const internalToken = process.env.MSDA_INTERNAL_TOKEN
  if (!internalToken) {
    console.error('[api-proxy] MSDA_INTERNAL_TOKEN is not set')
    return fail('Backend integration is not configured', 'backend_not_configured', 503)
  }

  const { path } = await params
  if (!path.length || path.some(s => s === '' || s === '.' || s === '..')) {
    return fail('Invalid path', 'bad_path', 400)
  }

  // D6 — privasi data klien untuk peran `viewer`
  const isViewer = authed.user.role !== 'admin'
  const route = path.join('/')
  if (isViewer && route === 'v1/client-access/export') {
    return fail('Only administrators can export client data', 'admin_required', 403)
  }
  let maskIps = false
  if (isViewer) {
    try {
      maskIps = (await getPrivacySettings()).mask_viewer_ips
    } catch {
      maskIps = true // gagal membaca pengaturan → aman: anggap aktif
    }
    // Endpoint yang isinya daftar klien/IP mentah disembunyikan sepenuhnya saat penyamaran aktif
    const rawClientRoutes = ['v1/client-access', 'v1/dashboard/top-clients']
    if (maskIps && (rawClientRoutes.includes(route) || /^v1\/access-points\/[^/]+\/clients$/.test(route))) {
      return fail('Client data is hidden for your role', 'hidden_for_role', 403)
    }
  }

  const search = new URL(request.url).search
  const target = `${backendBase()}/api/${path.map(encodeURIComponent).join('/')}${search}`

  const headers = new Headers({
    'X-Internal-Token': internalToken,
    'X-MSDA-User': authed.user.username,
  })
  const accept = request.headers.get('accept')
  if (accept) headers.set('accept', accept)
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  let body: string | undefined
  if (!READ_METHODS.has(method)) {
    body = await request.text()
    if (body.length > MAX_BODY_BYTES) return fail('Request body too large', 'too_large', 413)
  }

  const streaming = (accept ?? '').includes('text/event-stream')
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual',
      // Aliran SSE tidak boleh dipotong timeout
      signal: streaming ? undefined : AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    console.error('[api-proxy] backend unreachable', method, path.join('/'), error)
    return fail('The backend is not reachable right now.', 'backend_unavailable', 502)
  }

  if (upstream.ok) {
    const a = auditFor(method, path, body ?? '')
    if (a) {
      // Tidak di-await: respons ke pengguna tidak boleh menunggu penulisan audit
      void recordAudit({ action: a.action, request, actor: actorOf(authed), targetType: 'notification', targetId: a.targetId, meta: a.meta })
    }
  }

  // Notifikasi berisi IP klien: samarkan untuk viewer bila diminta
  if (maskIps && upstream.ok && method === 'GET' && route.startsWith('v1/notifications') && (upstream.headers.get('content-type') ?? '').includes('json')) {
    try {
      const json = (await upstream.json()) as { data?: unknown }
      const items = Array.isArray(json.data) ? json.data : []
      for (const n of items as { data?: { client?: { ip?: string }[] } }[]) {
        for (const c of n?.data?.client ?? []) c.ip = maskIp(c.ip)
      }
      return NextResponse.json(json, { status: upstream.status, headers: NO_STORE })
    } catch {
      return fail('Could not process the notifications response', 'upstream_invalid', 502)
    }
  }

  const out = new Headers({ 'Cache-Control': 'no-store' })
  for (const h of PASS_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h)
    if (v) out.set(h, v)
  }
  const noBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304
  return new Response(noBody ? null : upstream.body, { status: upstream.status, headers: out })
}

export const GET = handle
export const HEAD = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
