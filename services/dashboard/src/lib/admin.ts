import { NextResponse } from 'next/server'
import { authenticate, type AuthedUser } from '@/lib/auth'

/**
 * Penjaga untuk aksi yang mengubah data (blocklist, storage, manajemen pengguna).
 *
 * Sebelumnya memakai satu token bersama (MSDA_ADMIN_TOKEN). Sekarang memakai login:
 * sesi di cookie HttpOnly + peran pengguna di database. Token bersama dihapus karena
 * tidak bisa dibedakan siapa yang bertindak dan tidak bisa dicabut per orang.
 */

export type AdminGuard = { user: AuthedUser; denied?: undefined } | { user?: undefined; denied: NextResponse }

export async function guardAdmin(request: Request): Promise<AdminGuard> {
  const authed = await authenticate(request)
  if (!authed) {
    return {
      denied: NextResponse.json({ error: 'Sign in required', code: 'auth_required' }, { status: 401 }),
    }
  }
  if (authed.user.role !== 'admin') {
    return {
      denied: NextResponse.json(
        { error: 'Administrator access required', code: 'admin_required' },
        { status: 403 },
      ),
    }
  }
  return { user: authed }
}

/** Dipakai route lama: `const denied = await requireAdmin(request); if (denied) return denied` */
export async function requireAdmin(request: Request): Promise<NextResponse | null> {
  const guard = await guardAdmin(request)
  return guard.denied ?? null
}

/** Selalu true: aksi tulis kini selalu butuh login. Dipertahankan agar kode lain tetap kompatibel. */
export function adminProtected(): boolean {
  return true
}
