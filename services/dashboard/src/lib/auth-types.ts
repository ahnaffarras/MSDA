/**
 * Tipe & aturan autentikasi yang dipakai server DAN browser.
 * Jangan impor modul Node (crypto, mongodb) di file ini.
 */

export type Role = 'admin' | 'viewer'

export const ROLES: Role[] = ['admin', 'viewer']

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  viewer: 'User',
}

export const ROLE_HINT: Record<Role, string> = {
  admin: 'Can view everything, change the blocklist and storage settings, and manage users.',
  viewer: 'Can view the dashboard and reports. Cannot change anything.',
}

export const SESSION_COOKIE = 'msda_session'

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/
export const USERNAME_HELP = '3–32 characters: lowercase letters, numbers, dot, dash or underscore.'

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'qwertyuiop', 'qwerty123',
  '1234567890', '0123456789', '12345678910', 'adminadmin', 'administrator',
  'welcome123', 'letmein123', 'iloveyou123', 'msda12345', 'msdaadmin',
])

/** Mengembalikan pesan kesalahan, atau null kalau kata sandi diterima. */
export function validatePassword(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`
  if (/^(.)\1+$/.test(password)) return 'Password cannot be one repeated character.'
  if (COMMON.has(password.toLowerCase())) return 'That password is too common. Choose another.'
  if (username && username.length >= 3 && password.toLowerCase().includes(username.toLowerCase())) {
    return 'Password cannot contain the username.'
  }
  return null
}

/** Bentuk pengguna yang aman dikirim ke browser (tanpa hash). */
export interface PublicUser {
  id: string
  username: string
  displayName: string
  role: Role
  isActive: boolean
  createdAt: string | null
  lastLoginAt: string | null
}

/** Terima hanya path internal untuk parameter ?next= (cegah open redirect). */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/api')) return '/'
  return raw
}
