import { createHmac } from 'node:crypto'

/**
 * Penyamaran data klien untuk peran `viewer` (D6). Modul server saja.
 *
 * IPv4  10.0.0.5  →  10.0.0.x·a3f2c1
 * Oktet terakhir disembunyikan, TETAPI tag HMAC (kunci rahasia server) membuat dua klien
 * berbeda di subnet yang sama tetap terbedakan — hitungan per klien di grafik/daftar tetap benar,
 * sementara IP aslinya tidak bisa ditebak tanpa kunci.
 */

const TAG_LEN = 6
const MASKED = /x·[0-9a-f]{6}$/

export function privacyKey(): string {
  return process.env.MSDA_PRIVACY_KEY || process.env.MSDA_INTERNAL_TOKEN || 'msda-privacy-default-key'
}

const tag = (value: string, key: string) => createHmac('sha256', key).update(value).digest('hex').slice(0, TAG_LEN)

export function maskIp(ip: string | null | undefined, key: string = privacyKey()): string {
  const v = (ip ?? '').trim()
  if (!v) return ''
  if (MASKED.test(v)) return v // sudah disamarkan
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(v)
  if (m) return `${m[1]}.${m[2]}.${m[3]}.x·${tag(v, key)}`
  if (v.includes(':')) return `${v.split(':').slice(0, 3).join(':')}:…x·${tag(v, key)}`
  return `x·${tag(v, key)}`
}

/** AA:BB:CC:DD:EE:FF → AA:BB:CC:xx:xx:xx (hanya OUI pabrikan yang terlihat). */
export function maskMac(mac: string | null | undefined): string {
  const v = (mac ?? '').trim()
  if (!v) return ''
  const parts = v.split(/[:-]/)
  return parts.length === 6 ? `${parts.slice(0, 3).join(':')}:xx:xx:xx` : 'xx:xx:xx:xx:xx:xx'
}

export { isMaskedIp } from '@/lib/masked'

export type IpMasker = (ip: string | null | undefined) => string
export const identityMasker: IpMasker = ip => ip ?? ''
