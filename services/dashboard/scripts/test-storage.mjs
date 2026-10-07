import {
  CLEANABLE,
  PROTECTED_COLLECTIONS,
  META,
  OLDEST_PLAUSIBLE,
  roleOf,
  findDef,
  isCompactable,
  cutoffFor,
  buildDeleteFilter,
  parseSettingsPatch,
  validateGlobal,
  firstRunAt,
  nextRunAfterRun,
  scheduleNext,
  parseTimeValue,
  formatBytes,
  diskTone,
  DEFAULT_GLOBAL,
} from "../src/lib/storage-config.ts";

console.log("=== RUNNING STORAGE CONFIG TESTS ===");

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}
function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

console.log("\n[1] Daftar koleksi & klasifikasi");
assert(roleOf("ip_access_dns") === "cleanable", "ip_access_dns = cleanable");
assert(roleOf("dns_raw_logs") === "cleanable", "dns_raw_logs = cleanable");
for (const n of PROTECTED_COLLECTIONS) assert(roleOf(n) === "protected", `${n} = protected`);
assert(roleOf("storage_settings") === "internal", "storage_settings = internal");
assert(roleOf("something_else") === "unmanaged", "koleksi tak dikenal = unmanaged");
const overlap = CLEANABLE.filter(
  (d) => PROTECTED_COLLECTIONS.includes(d.name) || Object.values(META).includes(d.name),
);
assert(overlap.length === 0, "tidak ada koleksi protected/internal di daftar CLEANABLE");
assert(new Set(CLEANABLE.map((d) => d.name)).size === CLEANABLE.length, "nama koleksi CLEANABLE unik");
for (const d of CLEANABLE) {
  assert(
    d.minRetentionDays >= 1 && d.defaultRetentionDays >= d.minRetentionDays && d.timeField.length > 0,
    `${d.name}: batas bawah & field waktu valid`,
  );
}
assert(findDef("admins") === undefined, "findDef(admins) = undefined");
assert(!isCompactable("admins") && !isCompactable("dns_blacklist"), "koleksi protected tidak bisa di-compact");
assert(isCompactable("ip_access_dns") && isCompactable(META.snapshots), "koleksi riwayat bisa di-compact");

console.log("\n[2] Batas waktu (cutoff) dalam WIB");
const c1 = cutoffFor(30, new Date("2026-10-07T00:30:00Z"));
assert(c1.iso === "2026-09-07T00:30:00.000Z", `cutoff ISO 30 hari (${c1.iso})`);
assert(c1.ymd === "2026-09-07", `cutoff ymd (${c1.ymd})`);
const c2 = cutoffFor(1, new Date("2026-10-06T18:00:00Z")); // 01:00 WIB 7 Okt
assert(c2.ymd === "2026-10-06", `cutoff ymd lintas tengah malam WIB (${c2.ymd})`);

console.log("\n[3] Filter hapus");
const NOW = new Date("2026-10-07T00:00:00Z");
const ipDef = findDef("ip_access_dns");
const f1 = buildDeleteFilter(ipDef, 90, NOW);
assert(Array.isArray(f1.$or) && f1.$or.length === 2, "tipe 'time': dua cabang (Date dan string)");
assert(f1.$or[0].timestamp.$lt instanceof Date, "cabang 1: $lt bertipe Date");
assert(
  f1.$or[1].timestamp.$gte === OLDEST_PLAUSIBLE && typeof f1.$or[1].timestamp.$lt === "string",
  "cabang 2: rentang string [2000-01-01, cutoff)",
);
const statsDef = findDef("dns_daily_stats");
const f2 = buildDeleteFilter(statsDef, 180, NOW);
assert(f2.date.$gte === OLDEST_PLAUSIBLE && f2.date.$lt === "2026-04-10", `tipe 'ymd': ${JSON.stringify(f2.date)}`);
for (const d of CLEANABLE) {
  const f = buildDeleteFilter(d, d.minRetentionDays, NOW);
  assert(Object.keys(f).length > 0, `${d.name}: filter tidak pernah kosong`);
}
assert(throws(() => buildDeleteFilter(ipDef, 0, NOW)), "retensi 0 ditolak");
assert(throws(() => buildDeleteFilter(ipDef, 1, NOW)), "retensi di bawah minimum (1 < 2) ditolak");
assert(throws(() => buildDeleteFilter(ipDef, 2.5, NOW)), "retensi pecahan ditolak");
assert(throws(() => buildDeleteFilter(ipDef, -5, NOW)), "retensi negatif ditolak");
assert(throws(() => buildDeleteFilter(ipDef, NaN, NOW)), "retensi NaN ditolak");
assert(throws(() => buildDeleteFilter(statsDef, 29, NOW)), "dns_daily_stats minimum 30 hari");
assert(!throws(() => buildDeleteFilter(statsDef, 30, NOW)), "dns_daily_stats 30 hari diterima");

console.log("\n[4] Validasi pengaturan");
assert(parseSettingsPatch(null).ok === false, "null ditolak");
assert(parseSettingsPatch([]).ok === false, "array ditolak");
assert(parseSettingsPatch({}).ok === true, "objek kosong diterima");
const okPatch = parseSettingsPatch({
  global: { snapshotIntervalMin: 60, runHour: 2 },
  policies: { dns_raw_logs: { enabled: true, retentionDays: 7, intervalDays: 1 } },
});
assert(okPatch.ok === true, "patch valid diterima");
assert(parseSettingsPatch({ policies: { admins: { enabled: true } } }).ok === false, "policy untuk admins ditolak");
assert(parseSettingsPatch({ policies: { dns_blacklist: { retentionDays: 5 } } }).ok === false, "policy untuk dns_blacklist ditolak");
assert(parseSettingsPatch({ policies: { ip_access_dns: { retentionDays: 1 } } }).ok === false, "retensi di bawah minimum ditolak");
assert(parseSettingsPatch({ policies: { ip_access_dns: { retentionDays: "30" } } }).ok === false, "angka berupa string ditolak");
assert(parseSettingsPatch({ policies: { ip_access_dns: { retentionDays: 99999 } } }).ok === false, "retensi > 3650 ditolak");
assert(parseSettingsPatch({ policies: { ip_access_dns: { enabled: "yes" } } }).ok === false, "enabled bukan boolean ditolak");
assert(parseSettingsPatch({ policies: { ip_access_dns: { hack: 1 } } }).ok === false, "field kebijakan tak dikenal ditolak");
assert(parseSettingsPatch({ policies: { ip_access_dns: { intervalDays: 0 } } }).ok === false, "interval 0 ditolak");
assert(parseSettingsPatch({ global: { snapshotIntervalMin: 7 } }).ok === false, "interval snapshot di luar pilihan ditolak");
assert(parseSettingsPatch({ global: { runHour: 24 } }).ok === false, "runHour 24 ditolak");
assert(parseSettingsPatch({ global: { nope: 1 } }).ok === false, "pengaturan global tak dikenal ditolak");
assert(validateGlobal({ ...DEFAULT_GLOBAL, warnPercent: 90, critPercent: 80 }) !== null, "warn ≥ crit ditolak");
assert(validateGlobal(DEFAULT_GLOBAL) === null, "bawaan valid");

console.log("\n[5] Jadwal (WIB)");
// 7 Okt 2026 01:00 WIB = 6 Okt 18:00 UTC
const before3 = new Date("2026-10-06T18:00:00Z");
assert(firstRunAt(before3, 3).toISOString() === "2026-10-06T20:00:00.000Z", "sebelum jam 03:00 WIB → hari yang sama");
const after3 = new Date("2026-10-06T21:00:00Z"); // 04:00 WIB
assert(firstRunAt(after3, 3).toISOString() === "2026-10-07T20:00:00.000Z", "setelah jam 03:00 WIB → besok");
const ran = new Date("2026-10-06T20:01:00Z"); // 03:01 WIB 7 Okt
assert(nextRunAfterRun(ran, 1, 3).toISOString() === "2026-10-07T20:00:00.000Z", "interval 1 hari → besok 03:00 WIB");
assert(nextRunAfterRun(ran, 7, 3).toISOString() === "2026-10-13T20:00:00.000Z", "interval 7 hari → 7 hari kalender kemudian");
const nowS = new Date("2026-10-08T00:00:00Z");
assert(
  scheduleNext({ now: nowS, lastRunAt: null, intervalDays: 7, runHour: 3 }).getTime() === firstRunAt(nowS, 3).getTime(),
  "belum pernah jalan → jam berikutnya",
);
assert(
  scheduleNext({ now: nowS, lastRunAt: ran, intervalDays: 7, runHour: 3 }).toISOString() === "2026-10-13T20:00:00.000Z",
  "pernah jalan & jadwal turunan di depan → dipakai",
);
assert(
  scheduleNext({ now: nowS, lastRunAt: ran, intervalDays: 1, runHour: 3 }).getTime() === firstRunAt(nowS, 3).getTime(),
  "jadwal turunan sudah lewat → jam berikutnya",
);

console.log("\n[6] Pembacaan waktu & format");
assert(parseTimeValue(new Date("2026-10-01T00:00:00Z"))?.toISOString() === "2026-10-01T00:00:00.000Z", "Date dibaca");
assert(parseTimeValue("2026-10-01T05:00:00.000Z")?.toISOString() === "2026-10-01T05:00:00.000Z", "string ISO dibaca");
assert(parseTimeValue("2026-10-01")?.toISOString() === "2026-09-30T17:00:00.000Z", "YYYY-MM-DD dibaca sebagai 00:00 WIB");
assert(parseTimeValue("abc") === null && parseTimeValue(123) === null && parseTimeValue(null) === null, "nilai tak terbaca → null");
assert(formatBytes(0) === "0 B" && formatBytes(1536) === "1.50 KB", "formatBytes B/KB");
assert(formatBytes(5 * 1024 * 1024 * 1024) === "5.00 GB", "formatBytes GB");
assert(formatBytes(null) === "-", "formatBytes(null) = -");
assert(diskTone(null, 70, 85) === "idle", "tone idle bila persen tidak diketahui");
assert(diskTone(50, 70, 85) === "safe" && diskTone(70, 70, 85) === "watch" && diskTone(85, 70, 85) === "flag", "tone safe/watch/flag");

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
