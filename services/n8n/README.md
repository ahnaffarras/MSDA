# n8n Service — SATA Workflow Automation

Folder ini berisi workflow n8n untuk pipeline SATA: dari penerimaan log DNS hingga laporan AI ke Slack.

---

## Struktur Workflow

```
workflows/
├── sata-dns-ingestion.json   # Workflow 1: Terima batch DNS dari Vector → MongoDB + alert real-time
└── sata-daily-report.json    # Workflow 2: Laporan harian AI via Gemini → Slack
```

---

## Workflow 1 — DNS Ingestion Pipeline

**File:** `workflows/sata-dns-ingestion.json`

```
Webhook (POST /webhook/sata-dns)
  └─► Split Batch (pisah array event)
        └─► Validasi Token (X-SATA-Token)
              ├─► [GAGAL] → 401 Unauthorized
              └─► [OK] → Klasifikasi Domain (flag/watch/safe)
                            └─► Rate Counter (Redis INCR per IP, TTL 60s)
                                  └─► Anomaly? (>1000 req/menit)
                                        ├─► [Ya]  → Alert Anomaly (Slack) → lanjut
                                        └─► [Tdk] → Cek Duplikat (Redis GET TTL 5 menit)
                                                       └─► Belum Dicatat?
                                                             ├─► [Baru]  → Tandai Cache → Simpan MongoDB
                                                             │               └─► Domain Berisiko?
                                                             │                     ├─► [flag] → Alert Slack
                                                             │                     └─► [aman] → 200 OK
                                                             └─► [Duplikat] → skip (tidak disimpan)
```

**Fitur yang digabung dari Phase 2:**
- Redis deduplication (TTL 5 menit per domain+IP)
- Rate limiting dengan anomaly detection (>1000 req/menit per IP)
- Klasifikasi diperluas: tambah `phishing`, `malware`, `telegram`

**Klasifikasi domain (dilakukan di Code node):**

| Level  | Contoh domain                                     | Warna  |
|--------|---------------------------------------------------|--------|
| `flag` | bet, judi, porn, casino, togel, bokep             | Merah  |
| `watch`| youtube, tiktok, instagram, roblox, discord, steam| Kuning |
| `safe` | wikipedia, github, ruangguru, kemdikbud, google   | Hijau  |

**Koleksi MongoDB yang ditulis:** `dns_events`

```json
{
  "timestamp":   "2026-08-18T09:45:00.000Z",
  "source_type": "mikrotik_dns",
  "ap_ip":       "192.168.10.1",
  "ap_name":     "Lab Komputer 1",
  "client_ip":   "192.168.10.45",
  "domain":      "youtube.com",
  "risk_level":  "watch",
  "ingested_at": "2026-08-18T09:45:01.123Z"
}
```

---

## Workflow 2 — Daily AI Report

**File:** `workflows/sata-daily-report.json`

Berjalan otomatis setiap hari pukul **23:00 WIB** (Senin–Sabtu). Menggunakan **Gemini 2.5 Flash**.

```
Schedule Trigger (23:00 WIB)
  ├─► Ambil data kemarin dari MongoDB (aggregate dns_events)
  └─► Ambil historis 7 hari dari MongoDB (ai_reports) — paralel
        └─► Susun Prompt AI (dengan data tren historis)
              ├─► [Tidak ada data] → Slack: notifikasi kosong
              └─► [Ada data] → Gemini 2.5 Flash
                                  └─► Siapkan Data Laporan (Set node)
                                        └─► Arsip ke MongoDB (ai_reports)
                                              └─► Slack: kirim laporan
```

**Peningkatan dari versi sebelumnya:**
- Model upgrade: `gemini-1.5-flash` → `gemini-2.5-flash`
- Fetch historis 7 hari secara paralel untuk perbandingan tren
- Prompt lebih terstruktur dengan format 5 bagian wajib
- Simpan `raw_data` lengkap ke MongoDB untuk audit

**Koleksi MongoDB yang ditulis:** `ai_reports`

```json
{
  "date_label":  "Senin, 18 Agustus 2026",
  "report_text": "...(teks laporan dari Gemini)...",
  "raw_rows":    150,
  "ap_count":    2
}
```

---

## Cara Import Workflow ke n8n

1. Jalankan stack terlebih dahulu:
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml up -d
   ```

2. Buka n8n di browser: [http://localhost:5678](http://localhost:5678)

3. Login atau buat akun pertama kali.

4. Import workflow:
   - Klik menu **⋮** (pojok kiri atas) → **Import from file**
   - Pilih `workflows/sata-dns-ingestion.json`
   - Ulangi untuk `workflows/sata-daily-report.json`

---

## Konfigurasi Credentials di n8n

Setelah import, buka setiap workflow dan buat credentials berikut:

### 1. MongoDB (`SATA MongoDB`)

| Field       | Nilai                              |
|-------------|------------------------------------|
| Host        | `mongo` (nama service Docker)      |
| Port        | `27017`                            |
| Database    | `sata`                             |
| Username    | nilai `MONGO_ROOT_USER` di `.env`  |
| Password    | nilai `MONGO_ROOT_PASSWORD` di `.env` |
| Auth Source | `admin`                            |

### 2. Slack (`SATA Slack`)

- Buat Slack App di [https://api.slack.com/apps](https://api.slack.com/apps)
- Aktifkan **Incoming Webhooks**
- Copy **Webhook URL** (`https://hooks.slack.com/services/...`) ke variabel `SLACK_WEBHOOK_URL` di `.env`
- Workflow menggunakan URL ini langsung via `$env.SLACK_WEBHOOK_URL`

### 3. Redis (`SATA Redis`)

| Field    | Nilai                         |
|----------|-------------------------------|
| Host     | `redis` (nama service Docker) |
| Port     | `6379`                        |
| Password | (kosong, tidak dipakai)       |

### 4. Google AI (Gemini)

- Dapatkan API key di [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Masukkan ke variabel `GOOGLE_AI_API_KEY` di file `.env`
- Di n8n buat credential bertipe **HTTP Query Auth**, field `name` = `key`, field `value` = API key Anda
- Beri nama credential: `SATA Google AI`

---

## Variabel Lingkungan yang Dibutuhkan

Semua variabel dikonfigurasi di `infrastructure/docker/.env`:

| Variabel              | Digunakan di Workflow            | Keterangan                                      |
|-----------------------|----------------------------------|-------------------------------------------------|
| `SATA_WEBHOOK_TOKEN`  | DNS Ingestion (validasi)         | Token rahasia yang sama dengan config Vector    |
| `GOOGLE_AI_API_KEY`   | Daily Report (Gemini)            | API key dari Google AI Studio                   |
| `SLACK_WEBHOOK_URL`   | DNS Ingestion + Daily Report     | Incoming Webhook URL dari Slack App             |
| `MONGO_ROOT_USER`     | Credential MongoDB               | Username MongoDB                                |
| `MONGO_ROOT_PASSWORD` | Credential MongoDB               | Password MongoDB                                |

---

## Mengaktifkan Workflow

Setelah semua credentials dikonfigurasi:

1. Buka workflow **SATA — DNS Ingestion Pipeline**
2. Klik toggle **Inactive → Active** di pojok kanan atas
3. Ulangi untuk **SATA — Daily AI Report**

Webhook akan aktif di: `http://localhost:5678/webhook/sata-dns`

---

## Menguji Webhook Secara Manual

Gunakan `curl` dari terminal untuk simulasi kiriman Vector:

```bash
curl -X POST http://localhost:5678/webhook/sata-dns \
  -H "Content-Type: application/json" \
  -H "X-SATA-Token: changeme-token" \
  -d '[
    {
      "timestamp": "2026-08-18T09:45:00.000Z",
      "source_type": "mikrotik_dns",
      "ap_ip": "192.168.10.1",
      "ap_name": "Lab Komputer 1",
      "client_ip": "192.168.10.45",
      "domain": "youtube.com"
    },
    {
      "timestamp": "2026-08-18T09:45:01.000Z",
      "source_type": "mikrotik_dns",
      "ap_ip": "192.168.10.1",
      "ap_name": "Lab Komputer 1",
      "client_ip": "192.168.10.12",
      "domain": "judionline.com"
    }
  ]'
```

Respons sukses: `{"ok": true, "accepted": 2}`

Event kedua (`judionline.com`) akan memicu Slack alert karena terklasifikasi `flag`.
