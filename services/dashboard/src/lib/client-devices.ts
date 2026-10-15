/**
 * Identitas klien (C3): memberi label pada IP/perangkat. Fungsi murni — aman di browser dan server.
 * Koleksi `client_devices`: { _id: "mac:<mac>" | "ip:<ip>", ip, mac?, hostname?, label, owner?, note?,
 * ip_history[], first_seen, last_seen, source, created_at, updated_at }.
 */
import { csvToObjects } from '@/lib/csv'

export interface DeviceInput {
  ip: string
  label: string
  mac?: string
  hostname?: string
  owner?: string
  note?: string
}

export interface ClientDevice extends DeviceInput {
  id: string
  ip_history: { ip: string; until: string }[]
  first_seen: string | null
  last_seen: string | null
  source: 'manual' | 'csv' | 'dhcp'
  updated_at: string | null
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const IPV6 = /^[0-9a-fA-F:]{2,39}$/
const MAC = /^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i
const HOST = /^[A-Za-z0-9]([A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/

export const isValidIp = (v: string) => IPV4.test(v) || (v.includes(':') && IPV6.test(v))

/** AA-BB-CC-DD-EE-FF / aabbccddeeff → aa:bb:cc:dd:ee:ff. null bila bukan MAC valid. */
export function normalizeMac(v: string): string | null {
  const t = v.trim()
  if (!MAC.test(t)) return null
  const hex = t.replace(/[:-]/g, '').toLowerCase()
  return hex.match(/../g)!.join(':')
}

export const deviceKey = (d: { ip: string; mac?: string }) => (d.mac ? `mac:${d.mac}` : `ip:${d.ip}`)

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/** Validasi + normalisasi satu perangkat. Spasi dipangkas, field kosong dibuang. */
export function validateDevice(raw: Record<string, unknown>): Parsed<DeviceInput> {
  const s = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '')
  const ip = s('ip')
  const label = s('label')
  if (!ip || !isValidIp(ip)) return { ok: false, error: 'A valid IP address is required.' }
  if (!label) return { ok: false, error: 'A label is required.' }
  if (label.length > 80) return { ok: false, error: 'Label is too long (maximum 80 characters).' }

  const out: DeviceInput = { ip, label }
  if (s('mac')) {
    const mac = normalizeMac(s('mac'))
    if (!mac) return { ok: false, error: 'MAC address is not valid (example: aa:bb:cc:dd:ee:ff).' }
    out.mac = mac
  }
  if (s('hostname')) {
    if (!HOST.test(s('hostname'))) return { ok: false, error: 'Hostname has invalid characters.' }
    out.hostname = s('hostname')
  }
  if (s('owner')) {
    if (s('owner').length > 80) return { ok: false, error: 'Owner is too long (maximum 80 characters).' }
    out.owner = s('owner')
  }
  if (s('note')) {
    if (s('note').length > 300) return { ok: false, error: 'Note is too long (maximum 300 characters).' }
    out.note = s('note')
  }
  return { ok: true, value: out }
}

export const IMPORT_MAX_ROWS = 5000
export const IMPORT_MAX_BYTES = 1_000_000

export interface ImportParse {
  devices: DeviceInput[]
  errors: { line: number; reason: string }[]
}

/** CSV (header: ip,label[,mac,hostname,owner,note]) → perangkat valid + daftar baris yang ditolak. */
export function parseDevicesCsv(text: string): Parsed<ImportParse> {
  if (text.length > IMPORT_MAX_BYTES) return { ok: false, error: 'The file is too large (maximum 1 MB).' }
  const { headers, rows } = csvToObjects(text)
  if (!headers.includes('ip') || !headers.includes('label')) {
    return { ok: false, error: 'The first row must be a header that includes "ip" and "label" columns.' }
  }
  if (rows.length === 0) return { ok: false, error: 'The file has no data rows.' }
  if (rows.length > IMPORT_MAX_ROWS) return { ok: false, error: `Too many rows (maximum ${IMPORT_MAX_ROWS}).` }

  const devices: DeviceInput[] = []
  const errors: ImportParse['errors'] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const v = validateDevice(r.values)
    if (!v.ok) {
      errors.push({ line: r.line, reason: v.error })
      continue
    }
    const key = deviceKey(v.value)
    if (seen.has(key)) {
      errors.push({ line: r.line, reason: 'Duplicate of an earlier row in this file.' })
      continue
    }
    seen.add(key)
    devices.push(v.value)
  }
  return { ok: true, value: { devices, errors } }
}
