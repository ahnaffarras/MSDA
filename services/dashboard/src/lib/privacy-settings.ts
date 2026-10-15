import { authenticate } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { identityMasker, maskIp, type IpMasker } from '@/lib/privacy'

/**
 * Pengaturan privasi (koleksi `app_settings`, dokumen `_id: "privacy"`).
 * Default: TIDAK menyamarkan (kompatibel dengan perilaku sebelumnya); admin dapat menyalakannya.
 */
export interface PrivacySettings {
  mask_viewer_ips: boolean
  updated_by?: string | null
  updated_at?: string | null
}

type Doc = { _id: string; mask_viewer_ips?: boolean; updated_by?: string; updated_at?: Date }

let cache: { at: number; value: PrivacySettings } | null = null
const TTL_MS = 10_000

export async function getPrivacySettings(force = false): Promise<PrivacySettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value
  const doc = await (await getDb()).collection<Doc>('app_settings').findOne({ _id: 'privacy' })
  const value: PrivacySettings = {
    mask_viewer_ips: doc?.mask_viewer_ips === true,
    updated_by: doc?.updated_by ?? null,
    updated_at: doc?.updated_at instanceof Date ? doc.updated_at.toISOString() : null,
  }
  cache = { at: Date.now(), value }
  return value
}

export async function savePrivacySettings(maskViewerIps: boolean, by: string): Promise<PrivacySettings> {
  await (await getDb())
    .collection<Doc>('app_settings')
    .replaceOne({ _id: 'privacy' }, { mask_viewer_ips: maskViewerIps, updated_by: by, updated_at: new Date() }, { upsert: true })
  return getPrivacySettings(true)
}

/**
 * Fungsi penyamar IP untuk pemanggil ini: admin selalu melihat IP asli; viewer disamarkan
 * bila pengaturan menyalakannya. Tidak terautentikasi = disamarkan (aman secara default).
 */
export async function ipMaskerFor(request: Request): Promise<IpMasker> {
  try {
    const authed = await authenticate(request)
    if (authed?.user.role === 'admin') return identityMasker
    const { mask_viewer_ips } = await getPrivacySettings()
    if (authed && !mask_viewer_ips) return identityMasker
    return ip => maskIp(ip)
  } catch {
    return ip => maskIp(ip) // gagal memeriksa → lebih baik menyamarkan
  }
}

/** True bila pemanggil ini harus dicegah melihat data klien rinci (viewer + penyamaran aktif). */
export async function clientDetailHidden(request: Request): Promise<boolean> {
  try {
    const authed = await authenticate(request)
    if (!authed) return true
    if (authed.user.role === 'admin') return false
    return (await getPrivacySettings()).mask_viewer_ips
  } catch {
    return true
  }
}
