import {
  formatDateLabel,
  formatTimestamp,
  formatNumberId,
  cleanSlackFormatting,
  buildReportText,
  buildRawData,
} from "../src/lib/report-format.ts";

console.log("=== RUNNING REPORT FORMAT TESTS ===");

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

function checkNoSlackArtifacts(text, caseName) {
  // Check no :emoji:
  const emojiMatch = text.match(/:[a-zA-Z0-9_+ -]+:/g);
  assert(!emojiMatch, `${caseName}: tidak boleh mengandung :emoji: (found: ${emojiMatch})`);

  // Check no single asterisk bold (*text*) not matching bullet (* ) or **bold**
  const lines = text.split("\n");
  let hasSingleAsteriskSlack = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("* ")) continue; // bullet is allowed
    // check for single asterisk bold
    if (/(?<!\*)\*([^*\n]+)\*(?!\*)/.test(line)) {
      hasSingleAsteriskSlack = true;
      console.error(`Found single asterisk Slack bold in line: "${line}"`);
    }
  }
  assert(!hasSingleAsteriskSlack, `${caseName}: tidak boleh mengandung Slack single-asterisk bold (*tebal*)`);
}

// ── TEST 1: ai terisi ───────────────────────────────────────────────────────
console.log("\n1. Test Dokumen dengan AI terisi:");
const mockReportWithAi = {
  _id: "6ac001",
  date: "2026-10-05",
  partial: false,
  generated_at: "2026-10-05T20:00:00.000Z",
  history_days: 7,
  ai_ok: true,
  ai: {
    headline: ":chart: Trafik DNS Normal dengan Peningkatan Domain Edukasi",
    summary: "Aktivitas jaringan *didominasi* oleh platform pembelajaran online seperti Google Classroom.",
    insights: [
      ":arrow_up: Kenaikan 35% pada trafik domain *belajar.kemdikbud.go.id*.",
      "Tidak ditemukan anomali signifikan pada jam istirahat.",
    ],
    per_ap: [
      { ap_name: "AP-Lab-TKJ", note: "Penggunaan tinggi saat sesi praktikum." },
    ],
    review_domains: [
      { domain: "unknown-analytics.com", reason: "Permintaan berulang tanpa reverse DNS" },
    ],
    recommendations: [
      "Perbarui daftar whitelist untuk platform ujian.",
    ],
  },
  summary: {
    total_requests: { today: 12500, baseline_avg: 11000, change_pct: 14 },
    unique_clients: { today: 120, baseline_avg: 100, change_pct: 20 },
    blacklist_hits: { today: 5, baseline_avg: 5, change_pct: 0 },
  },
  trends: {
    ap_totals: [
      { ap: "AP-Lab-TKJ", today: 8500, change_pct: 12, unique_clients: 60 },
      { ap: "AP-Perpus", today: 4000, change_pct: -5, unique_clients: 40 },
    ],
  },
};

const mockStats = {
  date: "2026-10-05",
  total_requests: 12500,
  unique_clients: 120,
  rows: 12500,
  blacklist_hits: 5,
  per_ap: [
    {
      ap_name: "AP-Lab-TKJ",
      total: 8500,
      unique_clients: 60,
      blacklist_hits: 5,
      groups: [{ group: "Gambling", type: "gambling", total: 5 }],
      domains: [
        { domain: "judi-online.com", group: "Gambling", total: 5 },
        { domain: "google.com", group: "Search", total: 8495 },
      ],
    },
  ],
  blacklist_events: [
    { client_ip: "192.168.1.50", ap_name: "AP-Lab-TKJ", domain: "judi-online.com", group: "Gambling", total: 5 },
  ],
};

const text1 = buildReportText(mockReportWithAi, mockStats);
const raw1 = buildRawData(mockStats);

assert(text1.includes("Trafik DNS Normal"), "Memuat headline AI");
assert(text1.includes("Insight Tren"), "Memuat seksi Insight Tren");
assert(text1.includes("Per Access Point"), "Memuat seksi Per Access Point");
assert(text1.includes("Domain yang Perlu Ditinjau"), "Memuat domain review");
assert(text1.includes("Saran"), "Memuat seksi Saran");
assert(text1.includes("vs rata-rata 7 hari"), "Memuat perbandingan history_days karena !partial");
assert(text1.includes("12.500"), "Angka diformat dengan pemisah titik (id-ID)");
checkNoSlackArtifacts(text1, "Case 1 (ai terisi)");

const parsedRaw1 = JSON.parse(raw1);
assert(parsedRaw1.length === 2, "raw_data memiliki 2 entri domain");
const flagged = parsedRaw1.find((r) => r.domain === "judi-online.com");
assert(flagged?.risk_level === "flag", "Domain di blacklist_events berstatus 'flag'");
assert(flagged?.client_count === 1, "client_count dihitung dari client_ip unik blacklist_events");
const safeDomain = parsedRaw1.find((r) => r.domain === "google.com");
assert(safeDomain?.client_count === 0, "client_count domain non-blacklist bernilai 0");

// ── TEST 2: ai: null ───────────────────────────────────────────────────────
console.log("\n2. Test Dokumen dengan ai: null (Fallback):");
const mockReportAiNull = {
  _id: "6ac002",
  date: "2026-10-04",
  partial: false,
  generated_at: "2026-10-04T20:00:00.000Z",
  history_days: 7,
  ai_ok: false,
  ai: null,
  summary: {
    total_requests: { today: 9200, baseline_avg: 10000, change_pct: -8 },
    unique_clients: { today: 85, baseline_avg: 90, change_pct: -6 },
    blacklist_hits: { today: 2, baseline_avg: 4, change_pct: -50 },
  },
  trends: {
    domain: {
      up: [{ domain: "youtube.com", today: 3500, change_pct: 25 }],
      down: [{ domain: "facebook.com", today: 500, change_pct: -40 }],
      fresh: [{ domain: "new-tool.dev", today: 150 }],
    },
    ap_totals: [{ ap: "AP-Lab-RPL", today: 9200, change_pct: -8, unique_clients: 85 }],
  },
};

const mockStats2 = {
  date: "2026-10-04",
  total_requests: 9200,
  unique_clients: 85,
  rows: 9200,
  blacklist_hits: 2,
  per_ap: [],
  blacklist_events: [
    { client_ip: "192.168.2.10", ap_name: "AP-Lab-RPL", domain: "phishing-link.net", group: "Phishing", total: 2 },
  ],
};

const text2 = buildReportText(mockReportAiNull, mockStats2);
assert(text2.includes("Analisis AI tidak tersedia"), "Memuat catatan AI tidak tersedia");
assert(text2.includes("Domain **youtube.com** mengalami kenaikan trafik"), "Memuat insight tren otomatis");
assert(text2.includes("Domain baru terdeteksi: **new-tool.dev**"), "Memuat deteksi fresh domain");
assert(text2.includes("phishing-link.net"), "Memuat review blacklist dari fallback");
checkNoSlackArtifacts(text2, "Case 2 (ai: null)");

// ── TEST 3: partial: true ──────────────────────────────────────────────────
console.log("\n3. Test Dokumen dengan partial: true:");
const mockReportPartial = {
  _id: "6ac003",
  date: "2026-10-05",
  partial: true,
  generated_at: "2026-10-05T14:30:00.000Z",
  history_days: 7,
  ai_ok: true,
  ai: {
    headline: "Laporan Sementara Siang Hari",
    summary: "Trafik setengah hari berjalan normal.",
    insights: ["Aktivitas stabil."],
  },
  summary: {
    total_requests: { today: 4500, baseline_avg: 11000, change_pct: -59 },
    unique_clients: { today: 75, baseline_avg: 100, change_pct: -25 },
    blacklist_hits: { today: 0, baseline_avg: 2, change_pct: null },
  },
};

const label3 = formatDateLabel(mockReportPartial.date, mockReportPartial.partial);
assert(label3.endsWith("(sementara)"), "date_label memuat akhiran '(sementara)'");
assert(label3.startsWith("Senin, 5 Okt 2026"), `date_label format benar (got: ${label3})`);

const text3 = buildReportText(mockReportPartial, null);
assert(!text3.includes("vs rata-rata"), "Tidak memuat perbandingan 'vs rata-rata' karena partial: true");
checkNoSlackArtifacts(text3, "Case 3 (partial: true)");

// ── TEST 4: tanpa dns_daily_stats ──────────────────────────────────────────
console.log("\n4. Test Dokumen tanpa dns_daily_stats:");
const raw4 = buildRawData(null);
assert(raw4 === "[]", "buildRawData(null) mengembalikan '[]'");

const text4 = buildReportText(mockReportWithAi, null);
assert(text4.length > 50, "buildReportText tetap berhasil menghasilkan teks saat stats null");
checkNoSlackArtifacts(text4, "Case 4 (tanpa dns_daily_stats)");

console.log(`\n=== HASIL: ${passed} PASSED, ${failed} FAILED ===\n`);
if (failed > 0) process.exit(1);
