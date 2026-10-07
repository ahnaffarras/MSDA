/**
 * Daftar blokir — dipakai bersama oleh API (server) dan halaman (client).
 * Tidak mengimpor apa pun dari server supaya aman dibundel ke browser.
 */

export interface BlacklistTypeInfo {
  value: string
  label: string
  group: string // nilai default field `group` saat admin menambah domain
}

/**
 * Nilai `type` dari seed n8n (gambling, adult, malware, phishing, testing)
 * + kategori hasil AI Analyzer (social_media, streaming, gaming) + custom.
 * Harus sama dengan oneof pada BlacklistRequest di backend Go (models.go).
 */
export const BLACKLIST_TYPES: BlacklistTypeInfo[] = [
  { value: 'gambling', label: 'Online gambling', group: 'Judi Online' },
  { value: 'adult', label: 'Adult content', group: 'Konten Dewasa' },
  { value: 'malware', label: 'Malware', group: 'Malware / Virus' },
  { value: 'phishing', label: 'Phishing', group: 'Phishing' },
  { value: 'crypto_miner', label: 'Crypto miner', group: 'Crypto Miner' },
  { value: 'social_media', label: 'Social media', group: 'Media Sosial' },
  { value: 'streaming', label: 'Streaming', group: 'Streaming' },
  { value: 'gaming', label: 'Gaming', group: 'Game' },
  { value: 'testing', label: 'Testing', group: 'Uji Coba SATA' },
  { value: 'custom', label: 'Other', group: 'Kustom' },
]

export const typeLabel = (value: string) =>
  BLACKLIST_TYPES.find(t => t.value === value)?.label ?? value

export const isKnownType = (value: string) => BLACKLIST_TYPES.some(t => t.value === value)

export interface BlacklistEntry {
  _id: string
  domain: string
  group: string
  type: string
  description: string
  is_active: boolean
  created_at: string | null
  /** jumlah akses ke domain ini (termasuk subdomain) 7 hari terakhir */
  hits_7d?: number
  last_hit?: string | null
}

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * Bersihkan masukan admin menjadi nama domain:
 *   "https://WWW.Judi99.com/slot?x=1" → "www.judi99.com"
 * Mengembalikan null kalau bukan domain yang valid.
 */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase()
  if (!d) return null
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // skema
  d = d.replace(/^[^@/]*@/, '') // user:pass@
  d = d.split(/[/?#]/)[0] // path, query, fragment
  d = d.replace(/:\d+$/, '') // port
  d = d.replace(/\.+$/, '') // titik di akhir
  return DOMAIN_RE.test(d) ? d : null
}

/** Pecah masukan beberapa domain (dipisah spasi, koma, titik koma, atau baris baru). */
export function splitDomains(input: string): string[] {
  return input.split(/[\s,;]+/).filter(Boolean)
}

/** n8n memblokir domain DAN seluruh subdomainnya (endsWith('.' + domain)). */
export function matchesBlacklist(domain: string, blocked: string): boolean {
  const d = domain.toLowerCase()
  const b = blocked.toLowerCase()
  return d === b || d.endsWith(`.${b}`)
}
