/**
 * Konfigurasi dan fungsi murni untuk halaman Storage & Cleanup.
 *
 * Berkas ini sengaja TANPA impor server (mongodb, db.ts, dll.) supaya aman dipakai
 * di browser, di route API, dan di skrip tes (`node scripts/test-storage.mjs`).
 *
 * ATURAN KESELAMATAN — jangan dilonggarkan tanpa berpikir panjang:
 *  1. Hanya koleksi di CLEANABLE yang boleh dibersihkan. Nama koleksi dari klien hanya
 *     dipakai sebagai kunci pencarian di daftar ini, tidak pernah langsung masuk query.
 *  2. Yang dihapus selalu DOKUMEN RIWAYAT yang field waktunya LEBIH LAMA dari batas
 *     (cutoff). Tidak ada drop collection dan tidak ada deleteMany({}).
 *  3. Dokumen tanpa field waktu, atau field waktunya tidak terbaca, TIDAK PERNAH cocok
 *     dengan filter, jadi tidak pernah terhapus (lihat buildDeleteFilter).
 *  4. Retensi punya batas bawah per koleksi (minRetentionDays).
 *  5. Dokumen terbaru tidak pernah ikut habis: pembersihan berhenti kalau filter akan
 *     menghapus SEMUA dokumen di koleksi (dicek di storage-service.ts).
 */

export const MIN_MS = 60_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000
/** WIB = UTC+7, tanpa DST. */
export const WIB_OFFSET_MS = 7 * HOUR_MS

export const MAX_RETENTION_DAYS = 3650
export const MAX_INTERVAL_DAYS = 90
/** Batas bawah wajar untuk string waktu; teks yang diawali angka kecil/huruf tidak ikut cocok. */
export const OLDEST_PLAUSIBLE = '2000-01-01'

/** Koleksi internal milik fitur ini. */
export const META = {
  settings: 'storage_settings',
  snapshots: 'storage_snapshots',
  logs: 'storage_cleanup_logs',
} as const

/* ───────────────────────────── daftar koleksi ───────────────────────────── */

/**
 * `time`  = field berisi Date BSON ATAU string ISO 8601 (n8n/Go menyimpan keduanya).
 * `ymd`   = string tanggal "YYYY-MM-DD" (zona WIB), dipakai laporan harian.
 */
export type TimeKind = 'time' | 'ymd'

export interface CleanableDef {
  name: string
  label: string
  description: string
  timeField: string
  kind: TimeKind
  defaultRetentionDays: number
  /** Retensi lebih pendek dari ini ditolak (API) dan tidak bisa dipilih (UI). */
  minRetentionDays: number
  defaultIntervalDays: number
  /** Peringatan yang ditampilkan di UI sebelum menghapus. */
  caution?: string
  legacy?: boolean
}

export const CLEANABLE: CleanableDef[] = [
  {
    name: 'ip_access_dns',
    label: 'DNS access log',
    description: 'One record per client access. Feeds most dashboard pages and the daily report.',
    timeField: 'timestamp',
    kind: 'time',
    defaultRetentionDays: 90,
    minRetentionDays: 2,
    defaultIntervalDays: 1,
    caution: 'Dashboard pages can only show data that is still stored. Keep at least as many days as the longest range you look at.',
  },
  {
    name: 'dns_raw_logs',
    label: 'Raw webhook archive',
    description: 'Full payload of every webhook call. Only useful for debugging; the fastest-growing collection.',
    timeField: 'received_at',
    kind: 'time',
    defaultRetentionDays: 14,
    minRetentionDays: 1,
    defaultIntervalDays: 1,
  },
  {
    name: 'dns_daily_stats',
    label: 'Daily statistics',
    description: 'One summary per day. The AI report compares today against this history to find trends.',
    timeField: 'date',
    kind: 'ymd',
    defaultRetentionDays: 180,
    minRetentionDays: 30,
    defaultIntervalDays: 7,
    caution: 'Trend comparison needs recent history. Keep at least 30 days.',
  },
  {
    name: 'dns_ai_reports',
    label: 'AI daily reports',
    description: 'The reports shown on the Daily Reports page.',
    timeField: 'date',
    kind: 'ymd',
    defaultRetentionDays: 365,
    minRetentionDays: 14,
    defaultIntervalDays: 7,
  },
  {
    name: 'dns_info',
    label: 'Domain info cache',
    description: 'AI-analysed domain details shown on the Domain Info page.',
    timeField: 'last_verified',
    kind: 'time',
    defaultRetentionDays: 365,
    minRetentionDays: 90,
    defaultIntervalDays: 30,
    caution: 'A domain deleted here is analysed again by Gemini the next time a client visits it (costs API quota).',
  },
  {
    name: 'notifications',
    label: 'Notifications',
    description: 'Blocklist alerts and batch summaries shown on the Notifications page.',
    timeField: 'timestamp',
    kind: 'time',
    defaultRetentionDays: 90,
    minRetentionDays: 7,
    defaultIntervalDays: 7,
  },
  {
    name: 'dns_events',
    label: 'Legacy DNS events',
    description: 'Older event log from a previous workflow version. Not written by the current workflow.',
    timeField: 'timestamp',
    kind: 'time',
    defaultRetentionDays: 30,
    minRetentionDays: 2,
    defaultIntervalDays: 7,
    legacy: true,
  },
  {
    name: 'client_access_dns',
    label: 'Legacy client access',
    description: 'Older per-client access log from a previous workflow version.',
    timeField: 'timestamp',
    kind: 'time',
    defaultRetentionDays: 30,
    minRetentionDays: 2,
    defaultIntervalDays: 7,
    legacy: true,
  },
]

/** Konfigurasi dan master data: TIDAK PERNAH dibersihkan oleh fitur ini. */
export const PROTECTED_COLLECTIONS: string[] = [
  'admins',
  'dns_blacklist',
  'blacklist',
  'groups',
  'nodes',
  'ip_mappings',
  'lab_configs',
  'network_types',
  'clients',
  'init_collection',
]

export type CollectionRole = 'cleanable' | 'protected' | 'internal' | 'unmanaged'

export function findDef(name: string): CleanableDef | undefined {
  return CLEANABLE.find(d => d.name === name)
}

export function roleOf(name: string): CollectionRole {
  if (findDef(name)) return 'cleanable'
  if ((Object.values(META) as string[]).includes(name)) return 'internal'
  if (PROTECTED_COLLECTIONS.includes(name)) return 'protected'
  return 'unmanaged'
}

/** Koleksi yang boleh dipadatkan (compact): yang dibersihkan + riwayat internal fitur ini. */
export function isCompactable(name: string): boolean {
  return Boolean(findDef(name)) || name === META.snapshots || name === META.logs
}

export function labelOf(name: string): string {
  return findDef(name)?.label ?? name
}

/* ───────────────────────────── pengaturan ───────────────────────────── */

export const SNAPSHOT_INTERVALS = [5, 15, 60, 360, 1440] as const

export function snapshotIntervalLabel(min: number): string {
  if (min < 60) return `${min} min`
  if (min < 1440) return `${min / 60} h`
  return `${min / 1440} day`
}

export interface GlobalSettings {
  /** seberapa sering ukuran database dicatat untuk grafik (menit) */
  snapshotIntervalMin: number
  /** lama riwayat grafik disimpan (hari) */
  snapshotRetentionDays: number
  /** jam (WIB) pembersihan otomatis dijalankan */
  runHour: number
  warnPercent: number
  critPercent: number
}

export const DEFAULT_GLOBAL: GlobalSettings = {
  snapshotIntervalMin: 15,
  snapshotRetentionDays: 30,
  runHour: 3,
  warnPercent: 70,
  critPercent: 85,
}

export interface CollectionPolicy {
  /** pembersihan otomatis menyala? Bawaan: mati, admin harus menyalakannya sendiri. */
  enabled: boolean
  /** simpan data N hari terakhir; yang lebih lama dihapus */
  retentionDays: number
  /** jalankan pembersihan tiap N hari */
  intervalDays: number
}

export function defaultPolicy(def: CleanableDef): CollectionPolicy {
  return { enabled: false, retentionDays: def.defaultRetentionDays, intervalDays: def.defaultIntervalDays }
}

export interface SettingsPatch {
  global?: Partial<GlobalSettings>
  policies?: Record<string, Partial<CollectionPolicy>>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Validasi body PUT /api/storage/settings. Ketat: tipe harus tepat, kunci tak dikenal
 * ditolak, dan retensi tidak boleh di bawah batas bawah koleksi.
 */
export function parseSettingsPatch(input: unknown): Parsed<SettingsPatch> {
  if (!isRecord(input)) return { ok: false, error: 'Body must be a JSON object.' }
  const out: SettingsPatch = {}

  if (input.global !== undefined) {
    if (!isRecord(input.global)) return { ok: false, error: '"global" must be an object.' }
    const g: Partial<GlobalSettings> = {}
    const known = ['snapshotIntervalMin', 'snapshotRetentionDays', 'runHour', 'warnPercent', 'critPercent']
    for (const k of Object.keys(input.global)) {
      if (!known.includes(k)) return { ok: false, error: `Unknown setting "${k}".` }
    }
    const src = input.global
    if (src.snapshotIntervalMin !== undefined) {
      const v = src.snapshotIntervalMin
      if (typeof v !== 'number' || !(SNAPSHOT_INTERVALS as readonly number[]).includes(v)) {
        return { ok: false, error: `snapshotIntervalMin must be one of ${SNAPSHOT_INTERVALS.join(', ')}.` }
      }
      g.snapshotIntervalMin = v
    }
    if (src.snapshotRetentionDays !== undefined) {
      const v = intIn(src.snapshotRetentionDays, 1, 365)
      if (v === null) return { ok: false, error: 'snapshotRetentionDays must be a whole number from 1 to 365.' }
      g.snapshotRetentionDays = v
    }
    if (src.runHour !== undefined) {
      const v = intIn(src.runHour, 0, 23)
      if (v === null) return { ok: false, error: 'runHour must be a whole number from 0 to 23.' }
      g.runHour = v
    }
    if (src.warnPercent !== undefined) {
      const v = intIn(src.warnPercent, 1, 99)
      if (v === null) return { ok: false, error: 'warnPercent must be a whole number from 1 to 99.' }
      g.warnPercent = v
    }
    if (src.critPercent !== undefined) {
      const v = intIn(src.critPercent, 1, 99)
      if (v === null) return { ok: false, error: 'critPercent must be a whole number from 1 to 99.' }
      g.critPercent = v
    }
    out.global = g
  }

  if (input.policies !== undefined) {
    if (!isRecord(input.policies)) return { ok: false, error: '"policies" must be an object.' }
    const policies: Record<string, Partial<CollectionPolicy>> = {}
    for (const [name, raw] of Object.entries(input.policies)) {
      const def = findDef(name)
      if (!def) return { ok: false, error: `"${name}" is not a collection that can be cleaned.` }
      if (!isRecord(raw)) return { ok: false, error: `Policy for "${name}" must be an object.` }
      for (const k of Object.keys(raw)) {
        if (!['enabled', 'retentionDays', 'intervalDays'].includes(k)) {
          return { ok: false, error: `Unknown policy field "${k}" for "${name}".` }
        }
      }
      const p: Partial<CollectionPolicy> = {}
      if (raw.enabled !== undefined) {
        if (typeof raw.enabled !== 'boolean') return { ok: false, error: `${name}: "enabled" must be true or false.` }
        p.enabled = raw.enabled
      }
      if (raw.retentionDays !== undefined) {
        const v = intIn(raw.retentionDays, def.minRetentionDays, MAX_RETENTION_DAYS)
        if (v === null) {
          return {
            ok: false,
            error: `${name}: keep-days must be a whole number from ${def.minRetentionDays} to ${MAX_RETENTION_DAYS}.`,
          }
        }
        p.retentionDays = v
      }
      if (raw.intervalDays !== undefined) {
        const v = intIn(raw.intervalDays, 1, MAX_INTERVAL_DAYS)
        if (v === null) return { ok: false, error: `${name}: run-every must be a whole number from 1 to ${MAX_INTERVAL_DAYS}.` }
        p.intervalDays = v
      }
      policies[name] = p
    }
    out.policies = policies
  }

  return { ok: true, value: out }
}

/** Aturan antar-field setelah digabung dengan nilai tersimpan. null = valid. */
export function validateGlobal(g: GlobalSettings): string | null {
  if (g.warnPercent >= g.critPercent) return 'The warning level must be lower than the critical level.'
  return null
}

/* ───────────────────────────── jadwal (WIB) ───────────────────────────── */

/** Awal hari WIB (00:00 WIB) yang memuat `ms`, dalam ms epoch UTC. */
export function wibDayStartMs(ms: number): number {
  return Math.floor((ms + WIB_OFFSET_MS) / DAY_MS) * DAY_MS - WIB_OFFSET_MS
}

/** Kemunculan berikutnya jam `runHour` WIB yang masih di depan `now`. */
export function firstRunAt(now: Date, runHour: number): Date {
  let t = wibDayStartMs(now.getTime()) + runHour * HOUR_MS
  if (t <= now.getTime()) t += DAY_MS
  return new Date(t)
}

/** Jadwal setelah satu pembersihan selesai: N hari kalender WIB kemudian, pada jam `runHour`. */
export function nextRunAfterRun(runAt: Date, intervalDays: number, runHour: number): Date {
  return new Date(wibDayStartMs(runAt.getTime()) + intervalDays * DAY_MS + runHour * HOUR_MS)
}

/**
 * Jadwal berikutnya untuk koleksi yang otomatisnya menyala. Bila pernah dijalankan dan
 * jadwal turunannya masih di depan, pakai itu; selain itu jalankan pada jam berikutnya.
 */
export function scheduleNext(opts: { now: Date; lastRunAt: Date | null; intervalDays: number; runHour: number }): Date {
  if (opts.lastRunAt) {
    const cand = nextRunAfterRun(opts.lastRunAt, opts.intervalDays, opts.runHour)
    if (cand.getTime() > opts.now.getTime()) return cand
  }
  return firstRunAt(opts.now, opts.runHour)
}

/* ───────────────────────────── filter hapus ───────────────────────────── */

export interface Cutoff {
  date: Date
  iso: string
  /** tanggal WIB "YYYY-MM-DD" dari batas waktu */
  ymd: string
}

export function cutoffFor(retentionDays: number, now: Date = new Date()): Cutoff {
  const date = new Date(now.getTime() - retentionDays * DAY_MS)
  return { date, iso: date.toISOString(), ymd: new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10) }
}

/**
 * Filter MongoDB untuk dokumen riwayat yang boleh dihapus.
 *
 * Sifat yang diandalkan (dokumentasi MongoDB, "type bracketing"): operator pembanding
 * hanya mencocokkan nilai bertipe SAMA dengan operan. Akibatnya:
 *  - cabang `$lt: Date` hanya cocok dengan field bertipe Date;
 *  - cabang string `[2000-01-01, cutoff)` hanya cocok dengan string yang diawali tahun;
 *  - field yang tidak ada, null, angka, atau teks aneh tidak cocok dengan keduanya,
 *    jadi dokumen seperti itu TIDAK PERNAH terhapus.
 */
export function buildDeleteFilter(def: CleanableDef, retentionDays: number, now: Date = new Date()): Record<string, unknown> {
  if (!Number.isInteger(retentionDays) || retentionDays < def.minRetentionDays || retentionDays > MAX_RETENTION_DAYS) {
    throw new Error(
      `Retention for ${def.name} must be a whole number from ${def.minRetentionDays} to ${MAX_RETENTION_DAYS} days.`,
    )
  }
  const c = cutoffFor(retentionDays, now)
  const f = def.timeField
  if (def.kind === 'ymd') {
    return { [f]: { $gte: OLDEST_PLAUSIBLE, $lt: c.ymd } }
  }
  return {
    $or: [{ [f]: { $lt: c.date } }, { [f]: { $gte: OLDEST_PLAUSIBLE, $lt: c.iso } }],
  }
}

/** Baca nilai waktu dari dokumen (Date, string ISO, atau YYYY-MM-DD WIB). null bila tak terbaca. */
export function parseTimeValue(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const d = new Date(v.length === 10 ? `${v}T00:00:00+07:00` : v)
  return Number.isNaN(d.getTime()) ? null : d
}

/* ───────────────────────────── format ───────────────────────────── */

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-'
  if (n < 1024) return `${Math.round(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`
}

export type Tone = 'safe' | 'watch' | 'flag' | 'idle'

/** Warna status dari persentase disk terpakai; idle bila persentase tidak diketahui. */
export function diskTone(percent: number | null, warn: number, crit: number): Tone {
  if (percent === null) return 'idle'
  if (percent >= crit) return 'flag'
  if (percent >= warn) return 'watch'
  return 'safe'
}

/* ───────────────────────────── bentuk data API ───────────────────────────── */

export interface DbStat {
  dataBytes: number
  storageBytes: number
  indexBytes: number
  /** storage + index = ruang yang benar-benar dipakai di disk */
  totalBytes: number
  objects: number
  collections: number
  /** pemakaian disk tempat MongoDB menyimpan data (null bila server tidak melaporkan) */
  fsUsedBytes: number | null
  fsTotalBytes: number | null
  fsPercent: number | null
}

export interface CollectionStat {
  name: string
  label: string
  role: CollectionRole
  count: number | null
  dataBytes: number | null
  storageBytes: number | null
  indexBytes: number | null
  totalBytes: number | null
  /** ruang kosong di dalam file (sisa penghapusan) yang dipakai ulang MongoDB; null bila tak dilaporkan */
  freeBytes: number | null
  oldestAt: string | null
  newestAt: string | null
}

export type RunStatus = 'ok' | 'partial' | 'skipped' | 'error'

export interface PolicyView extends CollectionPolicy {
  name: string
  label: string
  description: string
  caution: string | null
  legacy: boolean
  timeField: string
  minRetentionDays: number
  lastRunAt: string | null
  lastDeleted: number | null
  lastStatus: RunStatus | null
  lastMessage: string | null
  lastMode: 'auto' | 'manual' | null
  nextRunAt: string | null
}

export interface StorageOverview {
  generatedAt: string
  adminProtected: boolean
  schedulerHeartbeatAt: string | null
  lastSnapshotAt: string | null
  db: DbStat
  collections: CollectionStat[]
  global: GlobalSettings
  policies: PolicyView[]
}

export interface StorageSummary {
  generatedAt: string
  tone: Tone
  db: DbStat
  largest: { name: string; label: string; totalBytes: number } | null
  autoEnabled: number
  autoTotal: number
  lastCleanup: { at: string; deleted: number; mode: 'auto' | 'manual'; collection: string } | null
  nextCleanupAt: string | null
  warnPercent: number
  critPercent: number
  snapshotIntervalMin: number
  schedulerHeartbeatAt: string | null
}

export interface SnapshotPoint {
  at: string
  totalBytes: number
  fsUsedBytes: number | null
  fsTotalBytes: number | null
}

export interface CleanupLogEntry {
  at: string
  action: 'cleanup' | 'compact'
  collection: string
  mode: 'auto' | 'manual'
  status: RunStatus
  deleted: number
  retentionDays: number | null
  cutoff: string | null
  durationMs: number
  message: string
}

export interface CleanupPreview {
  collection: string
  retentionDays: number
  cutoff: string
  total: number | null
  /** null = terlalu besar untuk dihitung cepat */
  matched: number | null
  /** alasan pembersihan ditolak; null = boleh jalan */
  blocked: string | null
  timeField: string
}

export interface CleanupResult {
  collection: string
  action: 'cleanup' | 'compact'
  mode: 'auto' | 'manual'
  status: RunStatus
  deleted: number
  retentionDays: number | null
  cutoff: string | null
  durationMs: number
  message: string
  /** compact: ukuran sebelum/sesudah */
  beforeBytes?: number | null
  afterBytes?: number | null
}
