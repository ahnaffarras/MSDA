/**
 * Tes integrasi OPSIONAL untuk Storage & Cleanup terhadap MongoDB sungguhan.
 *
 * Aman dijalankan di server yang sama dengan data asli: semua data uji ditaruh di
 * database sementara `msdatest_<waktu>` yang dihapus di akhir. Database `msda` tidak disentuh.
 *
 *   TEST_MONGODB_URI="mongodb://msda:msda123@localhost:27017/?authSource=admin" \
 *     npx tsx --tsconfig tsconfig.json scripts/test-storage-integration.mjs
 *
 * (dari folder services/dashboard; `tsx` diunduh otomatis oleh npx)
 */
import { MongoClient } from 'mongodb'
import {
  InputError, compactCollection, getCollectionStats, getDbStat, getLogs, getOverview, getSnapshots,
  getSummary, loadSettings, previewCleanup, recordSnapshot, runCleanup, runSchedulerTick, saveSettings,
} from '@/lib/storage-service'
import { DAY_MS } from '@/lib/storage-config'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.error('  ✗ FAIL:', m) } }
const ago = (d) => new Date(Date.now() - d * DAY_MS)
const ymd = (d) => new Date(Date.now() + 7 * 3600e3 - d * DAY_MS).toISOString().slice(0, 10)

async function main() {
  const uri = process.env.TEST_MONGODB_URI
  if (!uri) { console.error('Set TEST_MONGODB_URI (mis. mongodb://user:pass@localhost:27017/?authSource=admin). Tes memakai database sementara msdatest_<waktu> dan menghapusnya di akhir; database "msda" tidak disentuh.'); process.exit(2) }
  const client = await new MongoClient(uri).connect()
  const db = client.db('msdatest_' + Date.now())
  console.log('db', db.databaseName)

  // ── seed ip_access_dns (campuran tipe) ──
  const col = db.collection('ip_access_dns')
  const docs = []
  for (let i = 0; i < 300; i++) docs.push({ k: 'old-str', timestamp: ago(100 + (i % 20)).toISOString() })
  for (let i = 0; i < 200; i++) docs.push({ k: 'old-date', timestamp: ago(100 + (i % 20)) })
  for (let i = 0; i < 100; i++) docs.push({ k: 'new-str', timestamp: ago(10).toISOString() })
  for (let i = 0; i < 50; i++) docs.push({ k: 'new-date', timestamp: ago(10) })
  for (let i = 0; i < 5; i++) docs.push({ k: 'missing' })
  for (let i = 0; i < 5; i++) docs.push({ k: 'null', timestamp: null })
  for (let i = 0; i < 5; i++) docs.push({ k: 'number', timestamp: 123 })
  for (let i = 0; i < 5; i++) docs.push({ k: 'weird', timestamp: 'not a date' })
  for (let i = 0; i < 5; i++) docs.push({ k: 'dmy', timestamp: '06/10/2020' })
  for (let i = 0; i < 5; i++) docs.push({ k: 'pre2000', timestamp: '1999-01-01T00:00:00Z' })
  for (let i = 0; i < 5; i++) docs.push({ k: 'epoch-str', timestamp: '1759000000000' })
  await col.insertMany(docs.map(d => ({ ...d })))
  const total0 = await col.countDocuments({})
  console.log('seeded ip_access_dns', total0)

  console.log('\n[1] validasi input')
  await runCleanup(db, 'admins', { mode: 'manual' }).then(() => ok(false, 'admins harus ditolak'), e => ok(e instanceof InputError, 'koleksi non-whitelist (admins) ditolak'))
  await runCleanup(db, 'dns_blacklist', { mode: 'manual' }).then(() => ok(false, 'ditolak'), e => ok(e instanceof InputError, 'dns_blacklist ditolak'))
  await runCleanup(db, '$where', { mode: 'manual' }).then(() => ok(false, 'ditolak'), e => ok(e instanceof InputError, 'nama aneh ditolak'))
  await runCleanup(db, 'ip_access_dns', { mode: 'manual', retentionDays: 0 }).then(() => ok(false, 'ditolak'), e => ok(e instanceof InputError, 'retensi 0 ditolak'))
  await runCleanup(db, 'ip_access_dns', { mode: 'manual', retentionDays: 1 }).then(() => ok(false, 'ditolak'), e => ok(e instanceof InputError, 'retensi 1 (< min 2) ditolak'))
  await previewCleanup(db, 'ip_access_dns', 1.5).then(() => ok(false, 'ditolak'), e => ok(e instanceof InputError, 'retensi pecahan ditolak'))
  ok((await col.countDocuments({})) === total0, 'tidak ada dokumen terhapus oleh input yang ditolak')

  console.log('\n[2] preview')
  const pv = await previewCleanup(db, 'ip_access_dns', 90)
  console.log('   preview:', JSON.stringify(pv))
  ok(pv.matched === 500, `preview menghitung 500 dokumen lama (dapat ${pv.matched})`)
  ok(pv.blocked === null, 'preview tidak diblokir')
  ok((await col.countDocuments({})) === total0, 'preview tidak menghapus apa pun')

  console.log('\n[3] hapus manual (retensi 90 hari)')
  const r = await runCleanup(db, 'ip_access_dns', { mode: 'manual', retentionDays: 90 })
  console.log('   hasil:', JSON.stringify(r))
  ok(r?.status === 'ok' && r.deleted === 500, `menghapus tepat 500 (dapat ${r?.deleted})`)
  const left = await col.find({}).toArray()
  ok(left.length === total0 - 500, `sisa ${left.length} = ${total0 - 500}`)
  const kinds = new Set(left.map(d => d.k))
  for (const k of ['new-str', 'new-date', 'missing', 'null', 'number', 'weird', 'dmy', 'pre2000', 'epoch-str']) ok(kinds.has(k), `dokumen "${k}" tetap ada`)
  ok(!kinds.has('old-str') && !kinds.has('old-date'), 'dokumen lama (string & Date) sudah hilang')
  const again = await runCleanup(db, 'ip_access_dns', { mode: 'manual', retentionDays: 90 })
  ok(again?.status === 'ok' && again.deleted === 0, 'dijalankan lagi → 0 terhapus (idempoten)')

  console.log('\n[4] koleksi yang semuanya lama → ditolak, tidak dikosongkan')
  await db.collection('dns_events').insertMany(Array.from({ length: 40 }, () => ({ timestamp: ago(400).toISOString() })))
  const pb = await previewCleanup(db, 'dns_events', 30)
  ok(pb.matched === 40 && typeof pb.blocked === 'string', 'preview: 40 cocok tapi diblokir (akan mengosongkan koleksi)')
  const rb = await runCleanup(db, 'dns_events', { mode: 'manual' })
  ok(rb?.status === 'skipped' && rb.deleted === 0, 'run: skipped, 0 terhapus')
  ok((await db.collection('dns_events').countDocuments({})) === 40, 'koleksi tetap 40 dokumen')

  console.log('\n[5] batch besar (12.000 dokumen lama + 10 baru) lintas beberapa batch')
  const big = db.collection('dns_raw_logs')
  const chunk = (n, d) => Array.from({ length: n }, () => ({ received_at: ago(d), payload: 'x' }))
  await big.insertMany(chunk(12000, 40)); await big.insertMany(chunk(10, 1))
  const rr = await runCleanup(db, 'dns_raw_logs', { mode: 'manual', retentionDays: 14, maxMs: 60_000 })
  console.log('   hasil:', JSON.stringify(rr))
  ok(rr?.status === 'ok' && rr.deleted === 12000, `menghapus 12000 lintas batch (dapat ${rr?.deleted})`)
  ok((await big.countDocuments({})) === 10, 'tersisa 10 dokumen baru')

  console.log('\n[5b] batas waktu → partial, lalu lanjut')
  await big.deleteMany({}); await big.insertMany(chunk(12000, 40)); await big.insertMany(chunk(10, 1))
  const rp = await runCleanup(db, 'dns_raw_logs', { mode: 'manual', retentionDays: 14, maxMs: 1 })
  console.log('   partial:', JSON.stringify(rp))
  ok(rp?.status === 'partial' && rp.deleted === 5000, `partial setelah 1 batch (dapat ${rp?.status}/${rp?.deleted})`)
  ok((await big.countDocuments({})) === 7010, 'sisa 7010 setelah batch pertama')
  const rp2 = await runCleanup(db, 'dns_raw_logs', { mode: 'manual', retentionDays: 14, maxMs: 60_000 })
  ok(rp2?.status === 'ok' && rp2.deleted === 7000, `lanjutan menghapus sisa 7000 (dapat ${rp2?.deleted})`)
  ok((await big.countDocuments({})) === 10, 'akhirnya tersisa 10 dokumen baru')

  console.log('\n[6] ymd (dns_daily_stats)')
  const ds = db.collection('dns_daily_stats')
  await ds.insertMany([{ date: ymd(400) }, { date: ymd(200) }, { date: ymd(100) }, { date: ymd(5) }, { date: ymd(0) }, { nodate: true }, { date: 123 }, { date: 'abc' }])
  const p2 = await previewCleanup(db, 'dns_daily_stats', 180)
  ok(p2.matched === 2, `180 hari: 2 cocok (dapat ${p2.matched})`)
  const r2 = await runCleanup(db, 'dns_daily_stats', { mode: 'manual', retentionDays: 180 })
  ok(r2?.deleted === 2, 'terhapus 2')
  ok((await ds.countDocuments({})) === 6, 'tersisa 6 (termasuk yang tanpa/abnormal tanggal)')
  await runCleanup(db, 'dns_daily_stats', { mode: 'manual', retentionDays: 29 }).then(() => ok(false, 'ditolak'), e => ok(e instanceof InputError, 'min 30 hari untuk dns_daily_stats ditegakkan'))

  console.log('\n[7] kunci: dua pembersihan bersamaan')
  await db.collection(('storage_settings')).updateOne({ _id: 'main' }, { $set: { 'locks.dns_info': new Date(Date.now() + 600000) } }, { upsert: true })
  const locked = await runCleanup(db, 'dns_info', { mode: 'manual' })
  ok(locked?.status === 'skipped', 'dipegang proses lain → skipped')
  const lockedAuto = await runCleanup(db, 'dns_info', { mode: 'auto' })
  ok(lockedAuto === null, 'auto saat terkunci → null (diam)')
  await db.collection('storage_settings').updateOne({ _id: 'main' }, { $unset: { 'locks.dns_info': '' } })

  console.log('\n[8] pengaturan + scheduler')
  const s1 = await saveSettings(db, { policies: { dns_raw_logs: { enabled: true, retentionDays: 7, intervalDays: 2 } }, global: { runHour: 5 } })
  ok(s1.ok, 'saveSettings ok')
  let ld = await loadSettings(db)
  ok(ld.policies.dns_raw_logs.enabled && ld.policies.dns_raw_logs.retentionDays === 7, 'kebijakan tersimpan')
  const next1 = ld.runState.dns_raw_logs?.nextRunAt
  ok(next1 instanceof Date && next1.getTime() > Date.now(), 'nextRunAt dijadwalkan di masa depan')
  const bad = await saveSettings(db, { global: { warnPercent: 90, critPercent: 80 } })
  ok(!bad.ok, 'warn ≥ crit ditolak')
  // jatuh tempo → tick menjalankannya
  await big.insertMany(chunk(30, 20))
  await db.collection('storage_settings').updateOne({ _id: 'main' }, { $set: { 'runState.dns_raw_logs.nextRunAt': new Date(Date.now() - 1000) } })
  await runSchedulerTick(db)
  ld = await loadSettings(db)
  ok(ld.runState.dns_raw_logs?.lastMode === 'auto' && ld.runState.dns_raw_logs?.lastStatus === 'ok', 'tick menjalankan pembersihan otomatis')
  ok((ld.runState.dns_raw_logs?.lastDeleted ?? 0) === 30, `auto menghapus 30 (dapat ${ld.runState.dns_raw_logs?.lastDeleted})`)
  const next2 = ld.runState.dns_raw_logs?.nextRunAt
  ok(next2 instanceof Date && next2.getTime() > Date.now() + DAY_MS, 'jadwal berikutnya ≥ 1 hari lagi (interval 2 hari)')
  ok(ld.heartbeatAt instanceof Date, 'heartbeat tercatat')
  ok(ld.lastSnapshotAt instanceof Date, 'snapshot diklaim oleh tick')
  ok((await big.countDocuments({})) === 10, 'dokumen baru tetap aman (10)')
  const before = (await db.collection('storage_cleanup_logs').countDocuments({}))
  await runSchedulerTick(db)
  ok((await db.collection('storage_cleanup_logs').countDocuments({})) === before, 'tick kedua langsung: tidak menjalankan ulang (belum jatuh tempo)')
  // koleksi non-aktif tidak disentuh
  ok((await db.collection('dns_events').countDocuments({})) === 40, 'koleksi yang otomatisnya mati tidak disentuh')

  console.log('\n[9] statistik / ringkasan / snapshot / log / compact')
  const dbs = await getDbStat(db); console.log('   dbStat:', JSON.stringify(dbs))
  ok(dbs.objects > 0 && dbs.totalBytes > 0, 'dbStats terbaca')
  const cs = await getCollectionStats(db, true)
  console.log('   collStats sample:', JSON.stringify(cs.find(c => c.name === 'ip_access_dns')))
  const ov = await getOverview(db); ok(ov.policies.length === 8 && ov.collections.length > 0, 'overview tersusun')
  const sm = await getSummary(db); ok(typeof sm.tone === 'string' && sm.autoEnabled === 1, 'summary tersusun (1 auto aktif)')
  await recordSnapshot(db)
  const snaps = db.collection('storage_snapshots')
  await snaps.deleteMany({})
  const base = Date.now() - 3 * 3600e3
  await snaps.insertMany(Array.from({ length: 36 }, (_, i) => ({ at: new Date(base + i * 5 * 60e3), totalBytes: 1000 + i, fsUsedBytes: 50, fsTotalBytes: 100 })))
  const ptsAll = await getSnapshots(db, 6, 120)
  ok(ptsAll.length === 36, `6 jam, 120 titik maks → 36 titik utuh (dapat ${ptsAll.length})`)
  const ptsDown = await getSnapshots(db, 6, 6)
  ok(ptsDown.length > 0 && ptsDown.length <= 7, `diringkas ke ≤7 titik (dapat ${ptsDown.length})`)
  ok(ptsDown[ptsDown.length - 1].totalBytes === 1035, 'titik terakhir = snapshot terbaru (1035)')
  ok(ptsDown.every((p, i) => i === 0 || p.at > ptsDown[i - 1].at), 'titik terurut menaik')
  const none = await getSnapshots(db, 1, 120, new Date(Date.now() - 10 * 86400e3))
  ok(none.length === 0, 'rentang tanpa data → array kosong')
  const logs = await getLogs(db, 20); ok(logs.length >= 4, `log tercatat (${logs.length})`)
  const cr = await compactCollection(db, 'ip_access_dns'); console.log('   compact:', cr.status, cr.message.slice(0, 100))
  await compactCollection(db, 'admins').then(() => ok(false, 'ditolak'), e => ok(e instanceof InputError, 'compact koleksi non-whitelist ditolak'))

  await client.db(db.databaseName).dropDatabase(); await client.close()
  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0)
}
main().catch(e => { console.error('CRASH', e); process.exit(2) })
