/**
 * DNS enforcement (AdGuard Home) — logika murni yang dipakai server DAN browser.
 * Tidak mengimpor modul Node. Validasi otoritatif tetap di backend Go
 * (internal/adguard/rules.go); ini lapisan awal supaya admin mendapat penolakan yang jelas.
 */

export const BLOCK_MODES = ['alert', 'enforce'] as const
export type BlockMode = (typeof BLOCK_MODES)[number]
export type EnforceStatus = 'pending' | 'synced' | 'error'

export const modeLabel = (m?: string) => (m === 'enforce' ? 'Block DNS' : 'Monitor')

export const isBlockMode = (v: unknown): v is BlockMode => v === 'alert' || v === 'enforce'

/** Public suffix umum (subset). Daftar lengkap dipakai backend (golang.org/x/net/publicsuffix). */
const COMMON_SUFFIXES = new Set([
  'co.id', 'or.id', 'ac.id', 'go.id', 'web.id', 'sch.id', 'my.id', 'biz.id', 'mil.id', 'net.id', 'desa.id',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'co.in', 'co.nz', 'com.sg',
  'com.my', 'com.br', 'com.cn', 'com.tr', 'com.hk', 'co.kr', 'co.za', 'blogspot.com', 'github.io',
  'herokuapp.com', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'cloudfront.net', 'amazonaws.com',
])

/** Domain populer: memblokirnya (beserta SEMUA subdomain) berdampak luas → butuh konfirmasi ketik ulang. */
const POPULAR = new Set([
  'google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'whatsapp.com', 'whatsapp.net', 'tiktok.com',
  'twitter.com', 'x.com', 'microsoft.com', 'live.com', 'office.com', 'apple.com', 'icloud.com', 'amazon.com',
  'cloudflare.com', 'github.com', 'wikipedia.org', 'netflix.com', 'spotify.com', 'zoom.us', 'telegram.org',
  'googleapis.com', 'gstatic.com', 'googleusercontent.com', 'akamai.net', 'windowsupdate.com', 'ubuntu.com',
  'debian.org', 'mozilla.org', 'gmail.com', 'outlook.com', 'yahoo.com', 'linkedin.com', 'slack.com', 'docker.io',
])

/** Label pertama dari domain terdaftar (mis. "abc" pada a.abc.co.id). Untuk heuristik domain pendek. */
function registrableLabel(domain: string): string {
  const p = domain.split('.')
  if (p.length < 2) return domain
  const two = p.slice(-2).join('.')
  return COMMON_SUFFIXES.has(two) && p.length >= 3 ? p[p.length - 3] : p[p.length - 2]
}

const covers = (parent: string, d: string) => d === parent || d.endsWith('.' + parent)

export function parseNeverBlock(env: string | undefined | null): string[] {
  return (env ?? '')
    .split(/[\s,;]+/)
    .map(s => s.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean)
}

export type EnforceCheck = { ok: true } | { ok: false; code: 'public_suffix' | 'never_block' | 'invalid'; message: string }

/**
 * Apakah `domain` (sudah dinormalisasi) boleh diblokir di DNS?
 * never-block ditolak dua arah: sama / subdomain / INDUK dari entri never-block.
 */
export function checkEnforceable(domain: string, neverBlock: string[] = []): EnforceCheck {
  const d = domain.trim().toLowerCase()
  if (!d || !d.includes('.')) return { ok: false, code: 'public_suffix', message: 'A TLD or single label cannot be blocked at DNS.' }
  if (COMMON_SUFFIXES.has(d)) return { ok: false, code: 'public_suffix', message: `${d} is a public suffix; blocking it would block unrelated sites.` }
  if (neverBlock.some(n => covers(n, d) || covers(d, n))) {
    return { ok: false, code: 'never_block', message: `${d} is on (or contains) the never-block list.` }
  }
  return { ok: true }
}

/** Domain berdampak luas: populer atau sangat pendek → admin harus mengetik ulang domainnya. */
export function isHighImpact(domain: string): boolean {
  const d = domain.trim().toLowerCase()
  if (POPULAR.has(d)) return true
  for (const p of POPULAR) if (d.endsWith('.' + p)) return true
  return registrableLabel(d).length <= 3
}

/** Pengaturan awal mode saat membuat/mengubah entri; field hanya ditulis bila perlu. */
export interface ModeChange {
  block_mode?: BlockMode
  include_subdomains?: boolean
}
