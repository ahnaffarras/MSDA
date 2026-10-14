# Workflows

> Dokumentasi lengkap alur kerja sistem DNS Monitoring & Filtering — berdasarkan implementasi aktual n8n workflows.
> **Terakhir diperbarui:** 2026-08-27 — disesuaikan dengan implementasi aktual.

---

## Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         DNS MONITORING PIPELINE                               │
│                                                                              │
│  MikroTik Router ──→ vector.dev ──→ HTTP POST ──→ n8n                       │
│                                                          │                   │
│                                               ┌──────────┴──────────┐       │
│                                               │                     │       │
│                                     ┌─────────▼─────────┐           │       │
│                                     │  DNS INGESTION     │           │       │
│                                     │  PIPELINE          │           │       │
│                                     │  (real-time)       │           │       │
│                                     └─────────┬─────────┘           │       │
│                                               │                     │       │
│                           ┌───────────────────┼───────────────┐     │       │
│                           │                   │               │     │       │
│                     ┌─────▼─────┐     ┌───────▼──────┐  ┌────▼────┐│      │
│                     │ RATE      │     │ DEDUP        │  │ SAVE    ││      │
│                     │ COUNTER   │     │ CHECK        │  │ MongoDB ││      │
│                     │ (redis)   │     │ (redis)      │  │         ││      │
│                     └─────┬─────┘     └───────┬──────┘  └────┬────┘│      │
│                           │                   │               │     │       │
│                     ┌─────▼─────┐       ┌─────▼─────┐  ┌─────▼───┐│      │
│                     │ ANOMALY   │       │ SLACK     │  │ DNS     ││      │
│                     │ DETECT    │       │ ALERT     │  │ EVENTS  ││      │
│                     │ (>1000)   │       │ (flag)    │  │ (mongo) ││      │
│                     └───────────┘       └───────────┘  └─────────┘│      │
│                                                                    │      │
│                                     ┌─────────────────────┐        │      │
│                                     │  DAILY AI REPORT    │        │      │
│                                     │  (cron 23:00 WIB)   │        │      │
│                                     └─────────┬───────────┘        │      │
│                                               │                    │      │
│                           ┌───────────────────┼────────────┐       │      │
│                           │                   │            │       │      │
│                     ┌─────▼─────┐     ┌───────▼──────┐ ┌───▼─────┐│     │
│                     │ MONGODB   │     │ GEMINI AI    │ │ SLACK   ││     │
│                     │ dns_events│     │ 2.5 Flash    │ │ REPORT  ││     │
│                     │ ai_reports│     │              │ │         ││     │
│                     └───────────┘     └──────────────┘ └─────────┘│     │
│                                                                    │     │
│                                     ┌─────────────────────┐        │     │
│                                     │  GO BACKEND API     │        │     │
│                                     │  (dashboard data)   │        │     │
│                                     └─────────┬───────────┘        │     │
│                                               │                    │     │
│                           ┌───────────────────┼────────────┐       │     │
│                           │                   │            │       │     │
│                     ┌─────▼─────┐     ┌───────▼──────┐ ┌───▼─────┐│    │
│                     │ DASHBOARD │     │ WEBSOCKET    │ │ API     ││    │
│                     │ Next.js   │     │ REAL-TIME    │ │ ROUTES  ││    │
│                     └───────────┘     └──────────────┘ └─────────┘│    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Workflow 1: DNS Ingestion Pipeline (`msda-dns-ingestion.json`)

Pipeline real-time untuk memproses DNS query dari MikroTik.

### Trigger

| Trigger | Fungsi | Endpoint |
|---------|--------|----------|
| **Webhook** | Menerima batch DNS query dari vector.dev | `POST /webhook/msda-dns` |

### Flow Lengkap

```
┌──────────────────────────────────────────────────────────────────┐
│  FASE 1: WEBHOOK TRIGGER                                         │
│                                                                  │
│  vector.dev ──POST──→ n8n /webhook/msda-dns                      │
│  Header: X-MSDA-Token: <token>                                   │
│  Body: { body: [ { timestamp, ap_ip, client_ip, domain, ... } ] }│
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FASE 2: SPLIT + VALIDASI + KLASIFIKASI                          │
│                                                                  │
│  1. Split Batch: Memecah array menjadi item individual           │
│  2. Validasi Token: Cek X-MSDA-Token header                      │
│     - VALID   → Lanjut                                           │
│     - INVALID → Response 401 Unauthorized                        │
│  3. Klasifikasi Domain: Menambahkan risk_level                   │
│     - "flag"   : gambling, adult, malware, phishing, crypto_miner│
│     - "watch"  : social_media, streaming, gaming                 │
│     - "safe"   : lainnya                                         │
│  4. Rate Counter: INCR + EXPIRE 60s per client_ip                │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FASE 3: ANOMALY DETECTION                                       │
│                                                                  │
│  IF rate:{client_ip} > 1000:                                     │
│    → Slack Alert: "IP {client_ip} melakukan {count} request      │
│       DNS dalam 1 menit — kemungkinan anomali atau loop!"       │
│  ELSE                                                            │
│    → Lanjut ke FASE 4                                            │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FASE 4: DUPLICATE CHECK                                         │
│                                                                  │
│  GET dedup:{domain}:{client_ip}                                  │
│  - EXISTS  → SKIP (sudah dicatat dalam 5 menit terakhir)        │
│  - NOT EXISTS → SET dedup:{domain}:{client_ip} "1" EX 300        │
│                 → Lanjut ke FASE 5                               │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FASE 5: SAVE + ALERT                                            │
│                                                                  │
│  1. MongoDB Insert → dns_events collection                       │
│     Fields: timestamp, source_type, ap_ip, ap_name, client_ip,  │
│             domain, risk_level, ingested_at                      │
│                                                                  │
│  2. IF risk_level = "flag":                                      │
│     → Slack Alert: "Domain berisiko terdeteksi!"                 │
│       with details: AP, IP Klien, Domain, Risk Level, Waktu     │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FASE 6: RESPONSE                                                │
│                                                                  │
│  Respond 200 OK: { "ok": true }                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Node-by-Node

| # | Node | Tipe | Fungsi |
|---|------|------|--------|
| 1 | `Webhook: Terima Batch DNS` | Webhook | Menerima POST dari vector.dev |
| 2 | `Split Batch` | SplitOut | Memecah array `body` menjadi item individual |
| 3 | `Validasi Token` | IF | Cek X-MSDA-Token header |
| 4 | `Tolak: 401` | Respond | Response 401 jika token invalid |
| 5 | `Klasifikasi Domain` | Code (JS) | Tambahkan `risk_level` berdasarkan domain keywords |
| 6 | `Rate Counter` | Redis INCR | Increment counter `rate:{client_ip}` |
| 7 | `Rate TTL` | Redis EXPIRE | Set TTL 60 detik pada rate counter |
| 8 | `Anomaly?` | IF | Cek apakah rate > 1000 (anomali) |
| 9 | `Alert: Anomaly Rate` | HTTP Request | Kirim Slack alert untuk anomali |
| 10 | `Cek Duplikat` | Redis GET | Cek `dedup:{domain}:{client_ip}` |
| 11 | `Belum Dicatat?` | IF | Cek apakah key dedup kosong |
| 12 | `Tandai Cache` | Redis SET | Set `dedup:{domain}:{client_ip} "1" EX 300` |
| 13 | `Simpan ke MongoDB` | MongoDB Insert | Insert ke `dns_events` |
| 14 | `Domain Berisiko?` | IF | Cek `risk_level = "flag"` |
| 15 | `Alert: Domain Berisiko` | HTTP Request | Kirim Slack alert untuk domain berisiko |
| 16 | `Balas: 200 OK` | Respond | Response 200 OK |

### Redis Operations

| Operasi | Key Pattern | Value | TTL | Kapan |
|---------|-------------|-------|-----|-------|
| INCR | `rate:{client_ip}` | counter | 60s | Setiap DNS query |
| EXPIRE | `rate:{client_ip}` | — | 60s | Setelah INCR |
| GET | `dedup:{domain}:{client_ip}` | — | — | Sebelum insert MongoDB |
| SET | `dedup:{domain}:{client_ip}` | `"1"` | 300s | Setelah insert MongoDB |

---

## Workflow 2: Daily AI Report (`msda-daily-report.json`)

Pipeline harian untuk generate laporan DNS traffic menggunakan AI.

### Trigger

| Trigger | Fungsi | Cron |
|---------|--------|------|
| **Schedule** | Generate laporan harian | `0 16 * * 1-6` (23:00 WIB, Senin-Sabtu) |

### Flow Lengkap

```
┌──────────────────────────────────────────────────────────────────┐
│  FASE 1: TRIGGER                                                 │
│                                                                  │
│  Cron: 0 16 * * 1-6 (UTC) = 23:00 WIB                           │
│  Runs: Senin - Sabtu                                             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FASE 2: AMBIL DATA                                              │
│                                                                  │
│  1. MongoDB Aggregate → dns_events (data kemarin)                │
│     Pipeline:                                                    │
│     - $match: timestamp >= kemarin 00:00, < hari ini 00:00       │
│     - $group: by ap_name + domain + risk_level                   │
│     - $project: ap_name, domain, risk_level, count, client_count │
│     - $sort: count DESC, $limit: 200                             │
│                                                                  │
│  2. MongoDB Find → ai_reports (historis 7 hari)                  │
│     Query: timestamp >= 7 hari lalu, < hari ini                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FASE 3: SUSUN PROMPT AI                                         │
│                                                                  │
│  Gabungkan:                                                      │
│  - Data DNS hari ini (per AP, domain, risk_level, count)         │
│  - Data historis 7 hari (untuk perbandingan tren)                │
│  - Format: laporan analyst keamanan jaringan sekolah             │
│  - Output: prompt untuk Gemini AI                                │
│                                                                  │
│  IF tidak ada data → Kirim Slack "Tidak ada data" → STOP        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FASE 4: GENERATE LAPORAN AI                                     │
│                                                                  │
│  Gemini 2.5 Flash API                                            │
│  - Temperature: 0.4                                              │
│  - Max tokens: 1500                                              │
│  - Input: prompt dari FASE 3                                     │
│  - Output: teks laporan dalam Bahasa Indonesia                   │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FASE 5: SIMPAN + KIRIM                                          │
│                                                                  │
│  1. MongoDB Insert → ai_reports collection                       │
│     Fields: timestamp, date_label, report_text, raw_rows,        │
│             ap_count, raw_data                                   │
│                                                                  │
│  2. Slack Kirim Laporan:                                         │
│     "Laporan Harian MSDA — {date_label}"                         │
│     + report_text + metadata                                     │
└──────────────────────────────────────────────────────────────────┘
```

### Node-by-Node

| # | Node | Tipe | Fungsi |
|---|------|------|--------|
| 1 | `Jadwal: Setiap Hari 23:00 WIB` | Schedule Trigger | Cron 0 16 * * 1-6 |
| 2 | `Ambil Data Harian` | MongoDB Aggregate | Aggregate dns_events (kemarin) |
| 3 | `Ambil Historis 7 Hari` | MongoDB Find | Find ai_reports (7 hari) |
| 4 | `Susun Prompt AI` | Code (JS) | Gabung data + buat prompt |
| 5 | `Ada Data?` | IF | Cek apakah ada data |
| 6 | `Slack: Tidak Ada Data` | HTTP Request | Kirim Slack notifikasi kosong |
| 7 | `Gemini 2.5 Flash: Generate Laporan` | HTTP Request | Call Gemini API |
| 8 | `Siapkan Data Laporan` | Set | Extract fields dari response |
| 9 | `Arsip ke MongoDB` | MongoDB Insert | Insert ke ai_reports |
| 10 | `Slack: Kirim Laporan` | HTTP Request | Kirim laporan ke Slack |

---

## Go Backend API Routes

### Public Routes (No Auth)

| Method | Endpoint | Handler | Fungsi |
|--------|----------|---------|--------|
| GET | `/health` | inline | Health check |
| POST | `/api/v1/auth/login` | AuthHandler.Login | Login admin |
| GET | `/api/v1/dashboard/summary` | DashboardHandler.Summary | Statistik ringkas |
| GET | `/api/v1/dashboard/lab-grid` | DashboardHandler.LabGrid | Grid lab per AP |
| GET | `/api/v1/dashboard/top-domains` | DashboardHandler.TopDomains | Domain terbanyak |
| GET | `/api/v1/dashboard/top-clients` | DashboardHandler.TopClients | Client terbanyak |
| GET | `/api/v1/dns-info` | DNSInfoHandler.List | Daftar dns_info |
| GET | `/api/v1/dns-info/groups` | DNSInfoHandler.Groups | Daftar group |
| GET | `/api/v1/dns-info/types` | DNSInfoHandler.Types | Daftar type |
| GET | `/api/v1/dns-info/:domain` | DNSInfoHandler.Detail | Detail domain |
| GET | `/api/v1/client-access` | ClientAccessHandler.List | Log akses client |
| GET | `/api/v1/client-access/stats` | ClientAccessHandler.Stats | Statistik akses |
| GET | `/api/v1/client-access/export` | ClientAccessHandler.Export | Export CSV |
| GET | `/api/v1/access-points` | AccessPointHandler.List | Daftar AP |
| GET | `/api/v1/notifications` | NotificationHandler.List | Daftar notifikasi |
| PATCH | `/api/v1/notifications/read-all` | NotificationHandler.ReadAll | Tandai semua dibaca |
| PATCH | `/api/v1/notifications/:id/read` | NotificationHandler.MarkRead | Tandai dibaca |
| GET | `/ws/dashboard` | ws.ServeWS | WebSocket real-time |

### Protected Routes (JWT Auth Required)

| Method | Endpoint | Handler | Fungsi |
|--------|----------|---------|--------|
| GET | `/api/v1/auth/me` | AuthHandler.Me | Info admin saat ini |
| POST | `/api/v1/blacklist` | BlacklistHandler.Create | Tambah blacklist |
| PUT | `/api/v1/blacklist/:id` | BlacklistHandler.Update | Update blacklist |
| PATCH | `/api/v1/blacklist/:id/toggle-active` | BlacklistHandler.ToggleActive | Toggle status |
| DELETE | `/api/v1/blacklist/:id` | BlacklistHandler.Delete | Hapus blacklist |

### Webhook Route (Token Auth Required)

| Method | Endpoint | Handler | Fungsi |
|--------|----------|---------|--------|
| POST | `/api/v1/webhooks/n8n` | WebhookHandler.Receive | Terima webhook dari n8n |

---

## Error Handling

### Vector → n8n Gagal
```
vector.dev retry sesuai konfigurasi
→ Jika n8n down, data DNS query hilang (tidak ada persistent queue di vector)
→ Solusi: pastikan n8n selalu running, monitor via Docker healthcheck
```

### n8n → MongoDB Gagal
```
Insert ke dns_events gagal
→ Data tidak tersimpan, tapi rate counter dan dedup sudah ter-set
→ Solusi: monitor MongoDB connection, cek logs n8n
```

### n8n → Slack Gagal
```
Slack webhook gagal
→ Alert tidak terkirim, tapi data tetap tersimpan di MongoDB
→ Solusi: cek SLACK_WEBHOOK_URL di .env
```

### Go Backend → MongoDB Gagal
```
Backend tidak bisa connect ke MongoDB
→ API return error 500
→ Solusi: cek MONGODB_URI di .env, pastikan MongoDB running
```

### Redis Down
```
Rate counting tidak bisa dilakukan → anomali tidak terdeteksi
Dedup tidak bisa dilakukan → data duplikat mungkin masuk ke MongoDB
→ Semua data tetap tersimpan di MongoDB sebagai fallback
→ Solusi: pastikan Redis running, monitor via Docker healthcheck
```
