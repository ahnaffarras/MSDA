import { getDb } from '@/lib/db'

/**
 * Index untuk koleksi data DNS (D7). Dipanggil sekali saat server start, di latar belakang:
 * kegagalan hanya dicatat dan tidak menghentikan dashboard.
 *
 * Catatan: `timestamp` pada `ip_access_dns` bisa berupa Date atau string ISO (data lama).
 * Filter waktu di lib/query.ts memakai $or untuk kedua tipe, dan tiap cabang memakai index ini.
 * Bentuk kunci `[bidang, timestamp]` mengikuti kueri yang sebenarnya dipakai halaman:
 *   klien → waktu, domain → waktu, AP → waktu.
 */
const INDEXES: { collection: string; keys: Record<string, 1 | -1>; name: string }[] = [
  { collection: 'ip_access_dns', keys: { timestamp: -1 }, name: 'ts_desc' },
  { collection: 'ip_access_dns', keys: { client_ip: 1, timestamp: -1 }, name: 'client_ts' },
  { collection: 'ip_access_dns', keys: { domain: 1, timestamp: -1 }, name: 'domain_ts' },
  { collection: 'ip_access_dns', keys: { 'ap_info.ip': 1, timestamp: -1 }, name: 'ap_ts' },
  { collection: 'ip_access_dns', keys: { ap_ip: 1, timestamp: -1 }, name: 'legacy_ap_ts' },
  { collection: 'dns_blacklist', keys: { domain: 1 }, name: 'domain' },
  { collection: 'dns_allowlist', keys: { domain: 1 }, name: 'domain' },
  { collection: 'dns_ai_reports', keys: { date: -1 }, name: 'date_desc' },
  { collection: 'dns_daily_stats', keys: { date: 1 }, name: 'date' },
  { collection: 'dns_info', keys: { domain: 1 }, name: 'domain' },
]

export async function ensureDataIndexes(): Promise<void> {
  const db = await getDb()
  for (const ix of INDEXES) {
    try {
      await db.collection(ix.collection).createIndex(ix.keys, { name: ix.name, background: true })
    } catch (error) {
      // mis. IndexOptionsConflict bila index serupa sudah ada dengan nama lain: aman diabaikan
      console.warn(`[indexes] ${ix.collection}.${ix.name}:`, error instanceof Error ? error.message : error)
    }
  }
}

export function ensureDataIndexesInBackground(): void {
  void ensureDataIndexes().catch(error => console.error('[indexes] failed', error))
}
