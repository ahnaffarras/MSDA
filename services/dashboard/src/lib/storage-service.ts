/**
 * Layanan sisi server untuk halaman Storage & Cleanup.
 * JANGAN diimpor dari komponen klien (memakai driver MongoDB).
 *
 * Yang dikerjakan berkas ini:
 *  - membaca ukuran database/koleksi (dbStats, $collStats),
 *  - menyimpan pengaturan retensi + jadwal di koleksi `storage_settings`,
 *  - membersihkan dokumen riwayat yang lebih tua dari batas (SELALU lewat buildDeleteFilter),
 *  - compact (mengembalikan ruang disk ke OS), snapshot untuk grafik, dan log aksi,
 *  - satu putaran scheduler (`runSchedulerTick`) yang dipanggil tiap menit.
 *
 * Pengaman tambahan di atas aturan di storage-config.ts:
 *  - penghapusan per batch lewat daftar _id yang baru saja cocok DAN filter yang sama
 *    diulang di deleteMany ($and), jadi dokumen yang tidak cocok tidak mungkin ikut terhapus;
 *  - sebelum tiap batch dicek masih ada dokumen yang TIDAK cocok (koleksi tidak pernah dikosongkan);
 *  - kunci per koleksi mencegah dua pembersihan/compact berjalan bersamaan.
 */
import type { Collection, Db, Document, Filter } from 'mongodb'
import { adminProtected } from '@/lib/admin'
import {
  CLEANABLE,
  DAY_MS,
  DEFAULT_GLOBAL,
  HOUR_MS,
  MAX_INTERVAL_DAYS,
  MAX_RETENTION_DAYS,
  META,
  MIN_MS,
  SNAPSHOT_INTERVALS,
  buildDeleteFilter,
  cutoffFor,
  defaultPolicy,
  diskTone,
  findDef,
  isCompactable,
  labelOf,
  nextRunAfterRun,
  parseTimeValue,
  roleOf,
  scheduleNext,
  validateGlobal,
  formatBytes,
  type CleanableDef,
  type CleanupLogEntry,
  type CleanupPreview,
  type CleanupResult,
  type CollectionPolicy,
  type CollectionStat,
  type DbStat,
  type GlobalSettings,
  type PolicyView,
  type RunStatus,
  type SettingsPatch,
  type SnapshotPoint,
  type StorageOverview,
  type StorageSummary,
} from '@/lib/storage-config'

/** Input yang salah (nama koleksi tidak dikenal, retensi di bawah batas, dst.) → HTTP 400. */
export class InputError extends Error {}

const SETTINGS_ID = 'main'
const BATCH_SIZE = 5_000
const BATCH_PAUSE_MS = 30
const LOCK_MS = 20 * MIN_MS
const AUTO_MAX_MS = 10 * MIN_MS
const MANUAL_MAX_MS = 25_000
const LOG_RETENTION_DAYS = 180
const MAINTENANCE_EVERY_MS = 6 * HOUR_MS

/* ───────────────────────────── dokumen pengaturan ───────────────────────────── */

interface RunStateDoc {
  lastRunAt?: Date | null
  lastDeleted?: number
  lastStatus?: RunStatus | null
  lastMessage?: string | null
  lastMode?: 'auto' | 'manual' | null
  nextRunAt?: Date | null
}

interface SettingsDoc {
  _id: string
  global?: Partial<GlobalSettings>
  policies?: Record<string, Partial<CollectionPolicy>>
  runState?: Record<string, RunStateDoc>
  locks?: Record<string, Date>
  lastSnapshotAt?: Date | null
  lastMaintenanceAt?: Date | null
  heartbeatAt?: Date | null
  createdAt?: Date
}

export interface LoadedSettings {
  global: GlobalSettings
  policies: Record<string, CollectionPolicy>
  runState: Record<string, RunStateDoc>
  lastSnapshotAt: Date | null
  lastMaintenanceAt: Date | null
  heartbeatAt: Date | null
}

const settingsCol = (db: Db): Collection<SettingsDoc> => db.collection<SettingsDoc>(META.settings)

const asDate = (v: unknown): Date | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : null)
const iso = (v: Date | null | undefined): string | null => (v ? v.toISOString() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return fallback
  return Math.min(Math.max(v, min), max)
}

/** Gabungkan dokumen tersimpan dengan nilai bawaan; nilai rusak/di luar batas diperbaiki, bukan dipercaya. */
export function mergeSettings(doc: SettingsDoc | null): LoadedSettings {
  const g = doc?.global ?? {}
  const interval = (SNAPSHOT_INTERVALS as readonly number[]).includes(g.snapshotIntervalMin as number)
    ? (g.snapshotIntervalMin as number)
    : DEFAULT_GLOBAL.snapshotIntervalMin
  const global: GlobalSettings = {
    snapshotIntervalMin: interval,
    snapshotRetentionDays: clampInt(g.snapshotRetentionDays, 1, 365, DEFAULT_GLOBAL.snapshotRetentionDays),
    runHour: clampInt(g.runHour, 0, 23, DEFAULT_GLOBAL.runHour),
    warnPercent: clampInt(g.warnPercent, 1, 99, DEFAULT_GLOBAL.warnPercent),
    critPercent: clampInt(g.critPercent, 1, 99, DEFAULT_GLOBAL.critPercent),
  }
  if (validateGlobal(global)) {
    global.warnPercent = DEFAULT_GLOBAL.warnPercent
    global.critPercent = DEFAULT_GLOBAL.critPercent
  }

  const policies: Record<string, CollectionPolicy> = {}
  for (const def of CLEANABLE) {
    const d = defaultPolicy(def)
    const p = doc?.policies?.[def.name]
    policies[def.name] = {
      enabled: p?.enabled === true,
      retentionDays: clampInt(p?.retentionDays, def.minRetentionDays, MAX_RETENTION_DAYS, d.retentionDays),
      intervalDays: clampInt(p?.intervalDays, 1, MAX_INTERVAL_DAYS, d.intervalDays),
    }
  }

  return {
    global,
    policies,
    runState: doc?.runState ?? {},
    lastSnapshotAt: asDate(doc?.lastSnapshotAt),
    lastMaintenanceAt: asDate(doc?.lastMaintenanceAt),
    heartbeatAt: asDate(doc?.heartbeatAt),
  }
}

export async function loadSettings(db: Db): Promise<LoadedSettings> {
  return mergeSettings(await settingsCol(db).findOne({ _id: SETTINGS_ID }))
}

async function ensureSettingsDoc(db: Db, now = new Date()): Promise<void> {
  await settingsCol(db).updateOne({ _id: SETTINGS_ID }, { $setOnInsert: { createdAt: now } }, { upsert: true })
}

/** Simpan perubahan pengaturan. Mengembalikan pesan galat bila ada aturan antar-field yang dilanggar. */
export async function saveSettings(
  db: Db,
  patch: SettingsPatch,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await loadSettings(db)
  const nextGlobal: GlobalSettings = { ...current.global, ...(patch.global ?? {}) }
  const problem = validateGlobal(nextGlobal)
  if (problem) return { ok: false, error: problem }

  const $set: Document = {}
  for (const [k, v] of Object.entries(patch.global ?? {})) $set[`global.${k}`] = v

  const runHourChanged = patch.global?.runHour !== undefined && patch.global.runHour !== current.global.runHour
  for (const def of CLEANABLE) {
    const p = patch.policies?.[def.name]
    const cur = current.policies[def.name]
    const next: CollectionPolicy = { ...cur, ...(p ?? {}) }
    if (p) for (const [k, v] of Object.entries(p)) $set[`policies.${def.name}.${k}`] = v

    const schedulingChanged =
      (p?.enabled !== undefined && p.enabled !== cur.enabled) ||
      (p?.intervalDays !== undefined && p.intervalDays !== cur.intervalDays)
    const lastRunAt = asDate(current.runState[def.name]?.lastRunAt)
    const missing = !asDate(current.runState[def.name]?.nextRunAt)

    if (next.enabled && (schedulingChanged || runHourChanged || missing)) {
      $set[`runState.${def.name}.nextRunAt`] = scheduleNext({
        now,
        lastRunAt,
        intervalDays: next.intervalDays,
        runHour: nextGlobal.runHour,
      })
    } else if (!next.enabled && p?.enabled === false) {
      $set[`runState.${def.name}.nextRunAt`] = null
    }
  }

  if (Object.keys($set).length === 0) return { ok: true }
  await ensureSettingsDoc(db, now)
  await settingsCol(db).updateOne({ _id: SETTINGS_ID }, { $set })
  return { ok: true }
}

/* ───────────────────────────── kunci per koleksi ───────────────────────────── */

async function acquireLock(db: Db, name: string, ms = LOCK_MS): Promise<boolean> {
  const now = new Date()
  await ensureSettingsDoc(db, now)
  const res = await settingsCol(db).updateOne(
    {
      _id: SETTINGS_ID,
      $or: [{ [`locks.${name}`]: { $exists: false } }, { [`locks.${name}`]: { $lte: now } }],
    },
    { $set: { [`locks.${name}`]: new Date(now.getTime() + ms) } },
  )
  return res.matchedCount === 1
}

async function releaseLock(db: Db, name: string): Promise<void> {
  try {
    await settingsCol(db).updateOne({ _id: SETTINGS_ID }, { $unset: { [`locks.${name}`]: '' } })
  } catch (e) {
    console.error('[storage] failed to release lock', name, errMsg(e))
  }
}

/* ───────────────────────────── ukuran database ───────────────────────────── */

export async function getDbStat(db: Db): Promise<DbStat> {
  const s = await db.command({ dbStats: 1, scale: 1 })
  const storage = num(s.storageSize) ?? 0
  const index = num(s.indexSize) ?? 0
  const fsUsed = num(s.fsUsedSize)
  const fsTotal = num(s.fsTotalSize)
  return {
    dataBytes: num(s.dataSize) ?? 0,
    storageBytes: storage,
    indexBytes: index,
    totalBytes: storage + index,
    objects: num(s.objects) ?? 0,
    collections: num(s.collections) ?? 0,
    fsUsedBytes: fsUsed,
    fsTotalBytes: fsTotal,
    fsPercent: fsUsed !== null && fsTotal ? Math.round((fsUsed / fsTotal) * 1000) / 10 : null,
  }
}

type SizeFields = Pick<
  CollectionStat,
  'count' | 'dataBytes' | 'storageBytes' | 'indexBytes' | 'totalBytes' | 'freeBytes'
>

async function readSizes(db: Db, name: string): Promise<SizeFields> {
  const empty: SizeFields = { count: null, dataBytes: null, storageBytes: null, indexBytes: null, totalBytes: null, freeBytes: null }
  try {
    const rows = await db
      .collection(name)
      .aggregate([{ $collStats: { storageStats: {} } }], { maxTimeMS: 15_000 })
      .toArray()
    const ss = rows[0]?.storageStats
    if (!ss) return empty
    const storage = num(ss.storageSize)
    const index = num(ss.totalIndexSize)
    return {
      count: num(ss.count),
      dataBytes: num(ss.size),
      storageBytes: storage,
      indexBytes: index,
      totalBytes: storage !== null || index !== null ? (storage ?? 0) + (index ?? 0) : null,
      freeBytes: num(ss.freeStorageSize),
    }
  } catch {
    return empty
  }
}

async function readEdges(db: Db, def: CleanableDef): Promise<{ oldestAt: string | null; newestAt: string | null }> {
  const col = db.collection(def.name)
  const has = { [def.timeField]: { $exists: true } }
  const opts = { projection: { [def.timeField]: 1 }, maxTimeMS: 5_000 }
  try {
    const [first, last] = await Promise.all([
      col.find(has, { ...opts, sort: { _id: 1 }, limit: 1 }).next(),
      col.find(has, { ...opts, sort: { _id: -1 }, limit: 1 }).next(),
    ])
    return {
      oldestAt: iso(parseTimeValue(first?.[def.timeField])),
      newestAt: iso(parseTimeValue(last?.[def.timeField])),
    }
  } catch {
    return { oldestAt: null, newestAt: null }
  }
}

export async function listCollectionNames(db: Db): Promise<string[]> {
  const infos = await db.listCollections({}, { nameOnly: true }).toArray()
  return infos
    .filter(i => i.type !== 'view' && !i.name.startsWith('system.'))
    .map(i => i.name)
    .sort()
}

export async function getCollectionStats(db: Db, withEdges: boolean): Promise<CollectionStat[]> {
  const names = await listCollectionNames(db)
  return Promise.all(
    names.map(async name => {
      const def = findDef(name)
      const [sizes, edges] = await Promise.all([
        readSizes(db, name),
        withEdges && def ? readEdges(db, def) : Promise.resolve({ oldestAt: null, newestAt: null }),
      ])
      return { name, label: labelOf(name), role: roleOf(name), ...sizes, ...edges }
    }),
  )
}

/* ───────────────────────────── ringkasan untuk API ───────────────────────────── */

function buildPolicyViews(loaded: LoadedSettings): PolicyView[] {
  return CLEANABLE.map(def => {
    const p = loaded.policies[def.name]
    const rs = loaded.runState[def.name] ?? {}
    return {
      ...p,
      name: def.name,
      label: def.label,
      description: def.description,
      caution: def.caution ?? null,
      legacy: def.legacy === true,
      timeField: def.timeField,
      minRetentionDays: def.minRetentionDays,
      lastRunAt: iso(asDate(rs.lastRunAt)),
      lastDeleted: typeof rs.lastDeleted === 'number' ? rs.lastDeleted : null,
      lastStatus: rs.lastStatus ?? null,
      lastMessage: rs.lastMessage ?? null,
      lastMode: rs.lastMode ?? null,
      nextRunAt: p.enabled ? iso(asDate(rs.nextRunAt)) : null,
    }
  })
}

export async function getOverview(db: Db, now = new Date()): Promise<StorageOverview> {
  const [dbStat, collections, loaded] = await Promise.all([getDbStat(db), getCollectionStats(db, true), loadSettings(db)])
  return {
    generatedAt: now.toISOString(),
    adminProtected: adminProtected(),
    schedulerHeartbeatAt: iso(loaded.heartbeatAt),
    lastSnapshotAt: iso(loaded.lastSnapshotAt),
    db: dbStat,
    collections,
    global: loaded.global,
    policies: buildPolicyViews(loaded),
  }
}

export async function getSummary(db: Db, now = new Date()): Promise<StorageSummary> {
  const [dbStat, collections, loaded] = await Promise.all([getDbStat(db), getCollectionStats(db, false), loadSettings(db)])
  const views = buildPolicyViews(loaded)

  let largest: StorageSummary['largest'] = null
  for (const c of collections) {
    if (c.totalBytes !== null && (!largest || c.totalBytes > largest.totalBytes)) {
      largest = { name: c.name, label: c.label, totalBytes: c.totalBytes }
    }
  }

  let lastCleanup: StorageSummary['lastCleanup'] = null
  let nextCleanupAt: string | null = null
  for (const v of views) {
    if (v.lastRunAt && v.lastMode && (v.lastStatus === 'ok' || v.lastStatus === 'partial')) {
      if (!lastCleanup || v.lastRunAt > lastCleanup.at) {
        lastCleanup = { at: v.lastRunAt, deleted: v.lastDeleted ?? 0, mode: v.lastMode, collection: v.name }
      }
    }
    if (v.nextRunAt && (!nextCleanupAt || v.nextRunAt < nextCleanupAt)) nextCleanupAt = v.nextRunAt
  }

  return {
    generatedAt: now.toISOString(),
    tone: diskTone(dbStat.fsPercent, loaded.global.warnPercent, loaded.global.critPercent),
    db: dbStat,
    largest,
    autoEnabled: views.filter(v => v.enabled).length,
    autoTotal: views.length,
    lastCleanup,
    nextCleanupAt,
    warnPercent: loaded.global.warnPercent,
    critPercent: loaded.global.critPercent,
    snapshotIntervalMin: loaded.global.snapshotIntervalMin,
    schedulerHeartbeatAt: iso(loaded.heartbeatAt),
  }
}

/* ───────────────────────────── log aksi ───────────────────────────── */

let metaIndexesReady = false
async function ensureMetaIndexes(db: Db): Promise<void> {
  if (metaIndexesReady) return
  try {
    await Promise.all([
      db.collection(META.snapshots).createIndex({ at: 1 }),
      db.collection(META.logs).createIndex({ at: -1 }),
    ])
    metaIndexesReady = true
  } catch (e) {
    console.error('[storage] could not create internal indexes:', errMsg(e))
  }
}

async function writeLog(db: Db, r: CleanupResult, at: Date): Promise<void> {
  try {
    await ensureMetaIndexes(db)
    await db.collection(META.logs).insertOne({
      at,
      action: r.action,
      collection: r.collection,
      mode: r.mode,
      status: r.status,
      deleted: r.deleted,
      retentionDays: r.retentionDays,
      cutoff: r.cutoff ? new Date(r.cutoff) : null,
      durationMs: r.durationMs,
      message: r.message,
    })
  } catch (e) {
    console.error('[storage] failed to write cleanup log:', errMsg(e))
  }
}

export async function getLogs(db: Db, limit: number): Promise<CleanupLogEntry[]> {
  const rows = await db.collection(META.logs).find({}).sort({ at: -1 }).limit(limit).toArray()
  return rows.map(r => ({
    at: iso(asDate(r.at)) ?? '',
    action: r.action === 'compact' ? 'compact' : 'cleanup',
    collection: typeof r.collection === 'string' ? r.collection : '',
    mode: r.mode === 'auto' ? 'auto' : 'manual',
    status: (['ok', 'partial', 'skipped', 'error'] as const).find(s => s === r.status) ?? 'error',
    deleted: num(r.deleted) ?? 0,
    retentionDays: num(r.retentionDays),
    cutoff: iso(asDate(r.cutoff)),
    durationMs: num(r.durationMs) ?? 0,
    message: typeof r.message === 'string' ? r.message : '',
  }))
}

/* ───────────────────────────── pembersihan ───────────────────────────── */

function requireDef(name: string): CleanableDef {
  const def = findDef(name)
  if (!def) throw new InputError(`"${name}" is not a collection that can be cleaned.`)
  return def
}

function filterFor(def: CleanableDef, retentionDays: number, now: Date): Filter<Document> {
  try {
    return buildDeleteFilter(def, retentionDays, now) as Filter<Document>
  } catch (e) {
    throw new InputError(errMsg(e))
  }
}

/** Apakah masih ada dokumen yang TIDAK cocok filter (yang akan tetap tinggal). */
async function hasKeeper(col: Collection<Document>, filter: Filter<Document>): Promise<boolean> {
  const doc = await col.findOne({ $nor: [filter] }, { projection: { _id: 1 }, sort: { _id: -1 }, maxTimeMS: 10_000 })
  return doc !== null
}

const BLOCK_ALL =
  'Every document in this collection is older than the cut-off. Cleanup is refused so the collection is never emptied. ' +
  'Check that new data is still arriving, or use a longer retention.'

export async function previewCleanup(
  db: Db,
  name: string,
  retentionOverride: number | null = null,
  now = new Date(),
): Promise<CleanupPreview> {
  const def = requireDef(name)
  const loaded = await loadSettings(db)
  const retention = retentionOverride ?? loaded.policies[name].retentionDays
  const filter = filterFor(def, retention, now)
  const col = db.collection(name)

  let total: number | null = null
  try {
    total = await col.estimatedDocumentCount()
  } catch {
    total = null
  }

  let matched: number | null = null
  try {
    matched = await col.countDocuments(filter, { maxTimeMS: 20_000 })
  } catch {
    matched = null
  }

  let blocked: string | null = null
  if (matched !== 0) {
    try {
      if (!(await hasKeeper(col, filter))) blocked = BLOCK_ALL
    } catch (e) {
      blocked = `Safety check could not finish (${errMsg(e)}). Try again.`
    }
  }

  return {
    collection: name,
    retentionDays: retention,
    cutoff: cutoffFor(retention, now).iso,
    total,
    matched,
    blocked,
    timeField: def.timeField,
  }
}

export interface RunOptions {
  mode: 'auto' | 'manual'
  /** menimpa retensi tersimpan (hanya untuk aksi manual dari UI; tetap divalidasi) */
  retentionDays?: number
  maxMs?: number
  /** auto: periksa lagi setelah memegang kunci bahwa memang sudah jatuh tempo */
  requireDue?: boolean
}

/**
 * Hapus dokumen riwayat yang lebih tua dari batas retensi. Mengembalikan null hanya untuk
 * mode auto yang ternyata tidak perlu jalan (sudah dikerjakan proses lain / belum jatuh tempo).
 */
export async function runCleanup(db: Db, name: string, opts: RunOptions): Promise<CleanupResult | null> {
  const def = requireDef(name)
  const startedMs = Date.now()
  const startedAt = new Date()

  if (!(await acquireLock(db, name))) {
    if (opts.mode === 'auto') return null
    return {
      collection: name,
      action: 'cleanup',
      mode: opts.mode,
      status: 'skipped',
      deleted: 0,
      retentionDays: null,
      cutoff: null,
      durationMs: Date.now() - startedMs,
      message: 'Another cleanup or compaction is already running for this collection. Try again in a few minutes.',
    }
  }

  try {
    const loaded = await loadSettings(db)
    const policy = loaded.policies[name]
    if (opts.requireDue) {
      const due = asDate(loaded.runState[name]?.nextRunAt)
      if (!policy.enabled || !due || due.getTime() > Date.now()) return null
    }

    const retention = opts.retentionDays ?? policy.retentionDays
    const now = new Date()
    const filter = filterFor(def, retention, now)
    const cutoff = cutoffFor(retention, now)
    const col = db.collection(name)
    const maxMs = opts.maxMs ?? (opts.mode === 'auto' ? AUTO_MAX_MS : MANUAL_MAX_MS)

    let deleted = 0
    let status: RunStatus = 'ok'
    let message = ''

    try {
      for (;;) {
        if (!(await hasKeeper(col, filter))) {
          status = deleted > 0 ? 'partial' : 'skipped'
          message = deleted > 0 ? `${BLOCK_ALL} Stopped early.` : BLOCK_ALL
          break
        }
        const batch = await col
          .find(filter, { projection: { _id: 1 }, sort: { _id: 1 }, limit: BATCH_SIZE, maxTimeMS: 60_000 })
          .toArray()
        if (batch.length === 0) break

        // Hapus hanya _id yang baru saja cocok, DAN ulangi filter yang sama (sabuk + pengaman).
        const res = await col.deleteMany({ $and: [{ _id: { $in: batch.map(b => b._id) } }, filter] })
        deleted += res.deletedCount
        if (res.deletedCount === 0) {
          status = 'error'
          message = 'Deleting made no progress, so it was stopped.'
          break
        }
        if (batch.length < BATCH_SIZE) break
        if (Date.now() - startedMs > maxMs) {
          status = 'partial'
          message = 'Time limit reached; more old documents remain. Run it again to continue.'
          break
        }
        await sleep(BATCH_PAUSE_MS)
      }
    } catch (e) {
      status = 'error'
      message = errMsg(e)
    }

    if (!message) {
      message =
        deleted > 0
          ? `Deleted ${deleted.toLocaleString('en-GB')} documents older than ${retention} days.`
          : `Nothing older than ${retention} days.`
    } else if (status === 'partial' || status === 'error') {
      message = `${deleted.toLocaleString('en-GB')} deleted. ${message}`
    }

    const finishedAt = new Date()
    const $set: Document = {
      [`runState.${name}.lastRunAt`]: finishedAt,
      [`runState.${name}.lastDeleted`]: deleted,
      [`runState.${name}.lastStatus`]: status,
      [`runState.${name}.lastMessage`]: message,
      [`runState.${name}.lastMode`]: opts.mode,
    }
    if (policy.enabled) {
      if (status === 'partial') {
        if (opts.mode === 'auto') $set[`runState.${name}.nextRunAt`] = new Date(Date.now() + 5 * MIN_MS)
      } else if (status === 'error' && opts.mode === 'auto') {
        $set[`runState.${name}.nextRunAt`] = new Date(Date.now() + HOUR_MS)
      } else {
        $set[`runState.${name}.nextRunAt`] = nextRunAfterRun(finishedAt, policy.intervalDays, loaded.global.runHour)
      }
    }
    await settingsCol(db).updateOne({ _id: SETTINGS_ID }, { $set })

    const result: CleanupResult = {
      collection: name,
      action: 'cleanup',
      mode: opts.mode,
      status,
      deleted,
      retentionDays: retention,
      cutoff: cutoff.iso,
      durationMs: finishedAt.getTime() - startedMs,
      message,
    }
    await writeLog(db, result, startedAt)
    return result
  } finally {
    await releaseLock(db, name)
  }
}

/* ───────────────────────────── compact ───────────────────────────── */

/**
 * Pemadatan (compact) mengembalikan ruang kosong di file koleksi ke sistem operasi.
 * Menghapus dokumen saja TIDAK mengecilkan file di disk: ruangnya dipakai ulang MongoDB,
 * tetapi angka pemakaian disk baru turun setelah compact. Tidak ada data yang dihapus.
 */
export async function compactCollection(db: Db, name: string): Promise<CleanupResult> {
  if (!isCompactable(name)) throw new InputError(`"${name}" cannot be compacted from here.`)
  const startedMs = Date.now()
  const startedAt = new Date()

  if (!(await acquireLock(db, name))) {
    return {
      collection: name,
      action: 'compact',
      mode: 'manual',
      status: 'skipped',
      deleted: 0,
      retentionDays: null,
      cutoff: null,
      durationMs: 0,
      message: 'Another cleanup or compaction is already running for this collection.',
    }
  }

  try {
    const before = (await readSizes(db, name)).storageBytes
    let status: RunStatus = 'ok'
    let message = ''
    try {
      await db.command({ compact: name })
    } catch (e) {
      status = 'error'
      message = errMsg(e)
    }
    const after = (await readSizes(db, name)).storageBytes
    if (status === 'ok') {
      const freed = before !== null && after !== null ? Math.max(0, before - after) : null
      message = freed && freed > 0 ? `Released ${formatBytes(freed)} back to the disk.` : 'Compaction finished; no extra space could be released.'
    }
    const result: CleanupResult = {
      collection: name,
      action: 'compact',
      mode: 'manual',
      status,
      deleted: 0,
      retentionDays: null,
      cutoff: null,
      durationMs: Date.now() - startedMs,
      message,
      beforeBytes: before,
      afterBytes: after,
    }
    await writeLog(db, result, startedAt)
    return result
  } finally {
    await releaseLock(db, name)
  }
}

/* ───────────────────────────── snapshot & riwayat ukuran ───────────────────────────── */

export async function recordSnapshot(db: Db, now = new Date()): Promise<void> {
  await ensureMetaIndexes(db)
  const [dbStat, cols] = await Promise.all([getDbStat(db), getCollectionStats(db, false)])
  await db.collection(META.snapshots).insertOne({
    at: now,
    totalBytes: dbStat.totalBytes,
    dataBytes: dbStat.dataBytes,
    indexBytes: dbStat.indexBytes,
    objects: dbStat.objects,
    fsUsedBytes: dbStat.fsUsedBytes,
    fsTotalBytes: dbStat.fsTotalBytes,
    // array (bukan objek) supaya nama koleksi yang mengandung titik tidak jadi nama field
    cols: cols.map(c => ({ n: c.name, b: c.totalBytes ?? 0, c: c.count ?? 0 })),
  })
  await ensureSettingsDoc(db, now)
  await settingsCol(db).updateOne({ _id: SETTINGS_ID }, { $set: { lastSnapshotAt: now } })
}

export async function getSnapshots(db: Db, hours: number, maxPoints = 120, now = new Date()): Promise<SnapshotPoint[]> {
  const from = new Date(now.getTime() - hours * HOUR_MS)
  const bucketMs = Math.max(MIN_MS, Math.ceil((hours * HOUR_MS) / maxPoints))
  // Hanya 4 field per snapshot, jadi aman dibaca semua lalu diringkas di sini
  // (≤ ~26 ribu dokumen untuk 90 hari dengan interval 5 menit).
  const rows = await db
    .collection(META.snapshots)
    .find(
      { at: { $gte: from, $lte: now } },
      { projection: { at: 1, totalBytes: 1, fsUsedBytes: 1, fsTotalBytes: 1 }, sort: { at: 1 }, maxTimeMS: 15_000 },
    )
    .toArray()

  // Ambil snapshot TERAKHIR di tiap bucket waktu.
  const lastPerBucket = new Map<number, SnapshotPoint>()
  for (const r of rows) {
    const at = asDate(r.at)
    const total = num(r.totalBytes)
    if (!at || total === null) continue
    const bucket = Math.floor(at.getTime() / bucketMs)
    lastPerBucket.set(bucket, {
      at: at.toISOString(),
      totalBytes: total,
      fsUsedBytes: num(r.fsUsedBytes),
      fsTotalBytes: num(r.fsTotalBytes),
    })
  }
  return [...lastPerBucket.entries()].sort((a, b) => a[0] - b[0]).map(([, point]) => point)
}

/* ───────────────────────────── scheduler ───────────────────────────── */

async function touchHeartbeat(db: Db, now: Date): Promise<void> {
  await settingsCol(db).updateOne(
    { _id: SETTINGS_ID },
    { $set: { heartbeatAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  )
}

/** Hapus riwayat internal milik fitur ini (snapshot & log) yang sudah melewati masa simpan. */
async function pruneInternal(db: Db, now: Date, loaded: LoadedSettings): Promise<void> {
  const snapCut = new Date(now.getTime() - loaded.global.snapshotRetentionDays * DAY_MS)
  const logCut = new Date(now.getTime() - LOG_RETENTION_DAYS * DAY_MS)
  await db.collection(META.snapshots).deleteMany({ at: { $lt: snapCut } })
  await db.collection(META.logs).deleteMany({ at: { $lt: logCut } })
}

/**
 * Satu putaran scheduler (dipanggil tiap menit oleh storage-scheduler.ts):
 *  1. catat heartbeat (untuk UI: apakah scheduler hidup),
 *  2. ambil snapshot bila sudah waktunya,
 *  3. rawat riwayat internal tiap beberapa jam,
 *  4. jalankan pembersihan otomatis untuk koleksi yang jatuh tempo.
 */
export async function runSchedulerTick(db: Db, now = new Date()): Promise<void> {
  await touchHeartbeat(db, now)
  const loaded = await loadSettings(db)

  // 2. snapshot — klaim atomik supaya dua proses tidak mencatat ganda
  const threshold = new Date(now.getTime() - loaded.global.snapshotIntervalMin * MIN_MS + 5_000)
  const claim = await settingsCol(db).updateOne(
    { _id: SETTINGS_ID, $or: [{ lastSnapshotAt: null }, { lastSnapshotAt: { $lte: threshold } }] },
    { $set: { lastSnapshotAt: now } },
  )
  if (claim.modifiedCount === 1) {
    try {
      await recordSnapshot(db, now)
    } catch (e) {
      console.error('[storage] snapshot failed:', errMsg(e))
    }
  }

  // 3. perawatan riwayat internal
  const maintThreshold = new Date(now.getTime() - MAINTENANCE_EVERY_MS)
  const maint = await settingsCol(db).updateOne(
    { _id: SETTINGS_ID, $or: [{ lastMaintenanceAt: null }, { lastMaintenanceAt: { $lte: maintThreshold } }] },
    { $set: { lastMaintenanceAt: now } },
  )
  if (maint.modifiedCount === 1) {
    try {
      await pruneInternal(db, now, loaded)
    } catch (e) {
      console.error('[storage] internal prune failed:', errMsg(e))
    }
  }

  // 4. pembersihan otomatis
  for (const def of CLEANABLE) {
    const policy = loaded.policies[def.name]
    if (!policy.enabled) continue
    const rs = loaded.runState[def.name]
    const due = asDate(rs?.nextRunAt)
    if (!due) {
      // otomatis menyala tetapi belum punya jadwal (mis. dokumen diubah manual) → buatkan
      await settingsCol(db).updateOne(
        { _id: SETTINGS_ID },
        {
          $set: {
            [`runState.${def.name}.nextRunAt`]: scheduleNext({
              now,
              lastRunAt: asDate(rs?.lastRunAt),
              intervalDays: policy.intervalDays,
              runHour: loaded.global.runHour,
            }),
          },
        },
      )
      continue
    }
    if (due.getTime() > now.getTime()) continue
    try {
      const r = await runCleanup(db, def.name, { mode: 'auto', requireDue: true })
      if (r) console.log(`[storage] auto cleanup ${def.name}: ${r.status} — ${r.message}`)
    } catch (e) {
      console.error(`[storage] auto cleanup ${def.name} failed:`, errMsg(e))
    }
  }
}
