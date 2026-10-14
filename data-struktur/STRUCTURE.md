# Structure

> Struktur data lengkap seluruh komponen MSDA — termasuk field, tipe, keterangan, contoh nilai, dan hubungan antar data.
> **Terakhir diperbarui:** 2026-08-27 — disesuaikan dengan implementasi aktual.

---

## Directory

```
data/
├── mongodb/
│   ├── dns_events.jsonc            # Log DNS query real-time (ditulis oleh n8n)
│   ├── dns_info.jsonc              # Data enriched domain (AI Analyzer output)
│   ├── dns_blacklist.jsonc         # Daftar domain blacklist (admin-managed)
│   ├── client_access_dns.jsonc     # Log akses client ke domain blacklist
│   ├── notifications.jsonc         # Notifikasi webhook dari n8n ke backend
│   ├── ai_reports.jsonc            # Laporan harian AI (Gemini output)
│   └── admins.jsonc                # Akun admin (authentication)
├── redis/
│   ├── rate_{client_ip}            # Rate-limit per IP (INCR + EXPIRE 60s)
│   └── dedup_{domain}_{client_ip}  # Deduplikasi domain+client (SET EX 300)
├── vector/
│   └── vector-to-websocketn8n.jsonc  # Batch DNS query dari MikroTik
└── webhook-hit/
    └── n8n-to-backend.jsonc          # Webhook payload ke Go backend
```

---

## MongoDB

### `dns_events`

Log real-time DNS query dari seluruh access point. **Ditulis oleh n8n** setiap kali ada batch DNS query dari vector.dev. Ini adalah koleksi utama untuk data mentah.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | ObjectId | Auto | ID dokumen MongoDB | `ObjectId("64c9f1a2b3d4e5f6a7b8c9d0")` |
| `timestamp` | String | Yes | ISO 8601, waktu query dari MikroTik | `"2026-08-27T05:34:55.293Z"` |
| `source_type` | String | Yes | Sumber data | `"mikrotik_dns"` |
| `ap_ip` | String | Yes | IP address Access Point | `"192.168.10.1"` |
| `ap_name` | String | Yes | Nama/label AP (readable) | `"Lab Komputer 1"` |
| `client_ip` | String | Yes | IP address client | `"192.168.10.45"` |
| `domain` | String | Yes | Domain yang di-query | `"youtube.com"` |
| `risk_level` | String | Yes | Klasifikasi risiko (ditambahkan n8n) | `"safe"` \| `"watch"` \| `"flag"` |
| `ingested_at` | String | Yes | ISO 8601, waktu n8n memproses | `"2026-08-27T05:34:56.000Z"` |

**Contoh Dokumen:**
```json
{
  "_id": ObjectId("64c9f1a2b3d4e5f6a7b8c9d0"),
  "timestamp": "2026-08-27T05:34:55.293Z",
  "source_type": "mikrotik_dns",
  "ap_ip": "192.168.10.1",
  "ap_name": "Lab Komputer 1",
  "client_ip": "192.168.10.45",
  "domain": "youtube.com",
  "risk_level": "safe",
  "ingested_at": "2026-08-27T05:34:56.000Z"
}
```

**Ditulis oleh:** n8n `msda-dns-ingestion.json` → MongoDB Insert (node: Simpan ke MongoDB)
**Dibaca oleh:** n8n `msda-daily-report.json` → MongoDB Aggregate (Ambil Data Harian), Go backend → Dashboard API

---

### `dns_info`

Data enriched hasil analisis domain oleh AI Analyzer. **DICATAT PERTAMA KALI** saat domain baru. Field `ip_scan` diperbarui berkala.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | ObjectId | Auto | ID dokumen MongoDB | `ObjectId("66b2c3d4e5f6a7b8c9d0e1f2")` |
| `domain` | String | Yes | Nama domain | `"instagram.com"` |
| `group` | String | Yes | Kategori/group domain | `"Instagram"` |
| `type` | String | Yes | Tipe kategori | `"social_media"` \| `"streaming"` \| `"gaming"` \| `"gambling"` \| `"adult"` \| `"cloud"` \| `"cdn"` \| `"educational"` \| `"other"` |
| `info_app` | Object | No | Metadata aplikasi | Lihat di bawah |
| `info_app.platform` | String[] | Yes (if set) | Platform didukung | `["mobile", "desktop", "web"]` |
| `info_app.company_responsible` | String | Yes (if set) | Perusahaan bertanggung jawab | `"Meta Platforms, Inc."` |
| `info_app.owner` | String | Yes (if set) | Pemilik domain | `"Meta Platforms, Inc."` |
| `ip_scan` | Object[] | No | Hasil scan IP domain | `[{ "ip": "142.250.80.46", "type": "A", "geo": "Jakarta, ID" }]` |
| `ip_scan[].ip` | String | Yes (if set) | IP address hasil scan | `"142.250.80.46"` |
| `ip_scan[].type` | String | Yes (if set) | Tipe DNS record | `"A"` \| `"AAAA"` \| `"CNAME"` \| `"MX"` \| `"TXT"` \| `"PTR"` \| `"NS"` |
| `ip_scan[].geo` | String | Yes (if set) | Lokasi geografis IP | `"Jakarta, ID"` |
| `ptr_hostname` | String | No | PTR record IP origin server | `"instagram-p42-shv-01-cgk1.fbcdn.net"` |
| `host_isp` | Object | No | Info ISP/host | Lihat di bawah |
| `host_isp.city` | String | Yes (if set) | Kota asal server | `"Jakarta"` |
| `host_isp.region` | String | Yes (if set) | Kode negara (ISO 3166) | `"ID"` |
| `host_isp.org` | String | Yes (if set) | Organisasi pemilik ASN | `"Facebook, Inc."` |
| `host_isp.asn` | String | Yes (if set) | Autonomous System Number | `"AS32934"` |
| `last_verified` | String | Yes | ISO 8601, waktu terakhir diverifikasi | `"2026-08-27T05:47:51.788Z"` |
| `timestamp` | String | Yes | ISO 8601, waktu pertama dicatat | `"2026-08-27T05:47:51.788Z"` |

**Contoh Dokumen:**
```json
{
  "_id": ObjectId("66b2c3d4e5f6a7b8c9d0e1f2"),
  "domain": "instagram.com",
  "group": "Instagram",
  "type": "social_media",
  "info_app": {
    "platform": ["mobile", "desktop", "web"],
    "company_responsible": "Meta Platforms, Inc.",
    "owner": "Meta Platforms, Inc."
  },
  "ip_scan": [
    { "ip": "157.240.1.35", "type": "A", "geo": "Singapore, SG" },
    { "ip": "2a03:2880:f203:c1:face:b00c:0:43", "type": "AAAA", "geo": "Singapore, SG" }
  ],
  "ptr_hostname": "instagram-p42-shv-01-cgk1.fbcdn.net",
  "host_isp": {
    "city": "Jakarta",
    "region": "ID",
    "org": "Facebook, Inc.",
    "asn": "AS32934"
  },
  "last_verified": "2026-08-27T05:47:51.788Z",
  "timestamp": "2026-08-27T05:47:51.788Z"
}
```

**Dibuat oleh:** AI Analyzer Worker (via Redis queue)
**Diperbarui oleh:** Cron trigger (update `ip_scan` berkala)
**Dibaca oleh:** Go backend → DNS Info API, Dashboard DNS Info page

---

### `dns_blacklist`

Daftar domain yang wajib diblokir / trigger notifikasi. **Dikelola manual oleh administrator** — tidak ada service yang auto-generate data ini.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | ObjectId | Auto | ID dokumen MongoDB | `ObjectId("65a1b2c3d4e5f6a7b8c9d0e1")` |
| `blocked_level` | String | Yes | Level blocking | `"domain"` \| `"group"` |
| `domain` | String | Conditional | Domain spesifik (jika blocked_level="domain") | `"totok777.com"` |
| `group` | String | Conditional | Group domain (jika blocked_level="group") | `"Totok 777"` |
| `type` | String | Yes | Kategori blacklist | `"gambling"` \| `"adult"` \| `"malware"` \| `"phishing"` \| `"crypto_miner"` \| `"custom"` |
| `is_active` | Boolean | Yes | Status aktif/tidaknya | `true` \| `false` |
| `created_at` | String | Yes | ISO 8601, waktu ditambahkan admin | `"2026-08-27T05:34:55.293Z"` |
| `updated_at` | String | Yes | ISO 8601, waktu terakhir diubah | `"2026-08-27T05:34:55.293Z"` |

**Contoh Dokumen:**
```json
{
  "_id": ObjectId("65a1b2c3d4e5f6a7b8c9d0e1"),
  "blocked_level": "group",
  "group": "Totok 777",
  "type": "gambling",
  "is_active": true,
  "created_at": "2026-08-27T05:34:55.293Z",
  "updated_at": "2026-08-27T05:34:55.293Z"
}
```

**Dikelola oleh:** Administrator (CRUD via Go backend API `/api/v1/blacklist`)
**Dibaca oleh:** Go backend → Blacklist API

---

### `client_access_dns`

Log akses client ke domain. **DICATAT OLEH GO BACKEND** saat menerima webhook dari n8n.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | ObjectId | Auto | ID dokumen MongoDB | `ObjectId("64c9f1a2b3d4e5f6a7b8c9d0")` |
| `timestamp` | String | Yes | ISO 8601, waktu akses tercatat | `"2026-08-27T05:34:55.293Z"` |
| `domain` | String | Yes | Domain yang diakses | `"totok777.com"` |
| `group` | String | Yes | Kategori group domain | `"Totok 777"` |
| `type` | String | Yes | Tipe kategori domain | `"gambling"` |
| `action` | String | Yes | Respons sistem | `"allowed"` \| `"blocked"` |
| `client_ip` | String | Yes | IP address client | `"192.168.10.88"` |
| `ap_info` | Object | Yes | Info Access Point | `{ "label": "Lab Komputer 1", "ip": "192.168.10.1" }` |
| `ap_info.label` | String | Yes | Nama/label AP (readable) | `"Lab Komputer 1"` |
| `ap_info.ip` | String | Yes | IP address AP | `"192.168.10.1"` |
| `access_count` | Number | Yes | Jumlah akses dalam batch | `5` |

**Contoh Dokumen:**
```json
{
  "_id": ObjectId("64c9f1a2b3d4e5f6a7b8c9d0"),
  "timestamp": "2026-08-27T05:34:55.293Z",
  "domain": "totok777.com",
  "group": "Totok 777",
  "type": "gambling",
  "action": "blocked",
  "client_ip": "192.168.10.88",
  "ap_info": {
    "label": "Lab Komputer 1",
    "ip": "192.168.10.1"
  },
  "access_count": 5
}
```

**Ditulis oleh:** Go backend Webhook Handler (saat terima payload dari n8n)
**Dibaca oleh:** Go backend → Client Access API, Dashboard Activity Log

---

### `notifications`

Notifikasi webhook dari n8n ke Go backend. **Ditulis oleh Go backend** saat menerima payload dari n8n.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | ObjectId | Auto | ID dokumen MongoDB | `ObjectId("67d8e9f0a1b2c3d4e5f6a7b8")` |
| `type_send` | String | Yes | Tipe notifikasi | `"blacklist_alert"` \| `"batch_summary"` |
| `data` | Object | Yes | Data notifikasi | Lihat di bawah |
| `data.domain` | String[] | Yes | List domain | `["totok777.com"]` |
| `data.group` | String | Yes | Nama group | `"Totok 777"` |
| `data.type` | String | Yes | Kategori domain | `"gambling"` |
| `data.client` | Object[] | Yes | Client yang akses | Lihat di bawah |
| `data.client[].ip` | String | Yes | IP client | `"192.168.10.88"` |
| `data.client[].access_count` | Number | Yes | Jumlah akses | `5` |
| `data.client[].ap_info` | Object | Yes | Info Access Point | `{ "label": "Lab Komputer 1", "ip": "192.168.10.1" }` |
| `is_read` | Boolean | Yes | Sudah dibaca admin | `false` \| `true` |
| `timestamp` | String | Yes | ISO 8601, waktu notifikasi | `"2026-08-27T05:34:55.293Z"` |

**Contoh Dokumen:**
```json
{
  "_id": ObjectId("67d8e9f0a1b2c3d4e5f6a7b8"),
  "type_send": "blacklist_alert",
  "data": {
    "domain": ["totok777.com"],
    "group": "Totok 777",
    "type": "gambling",
    "client": [
      {
        "ip": "192.168.10.88",
        "access_count": 5,
        "ap_info": { "label": "Lab Komputer 1", "ip": "192.168.10.1" }
      }
    ]
  },
  "is_read": false,
  "timestamp": "2026-08-27T05:34:55.293Z"
}
```

**Ditulis oleh:** Go backend Webhook Handler
**Dibaca oleh:** Go backend → Notification API, Dashboard Notifications page

---

### `ai_reports`

Laporan harian hasil analisis AI (Gemini). **Ditulis oleh n8n** setiap hari jam 23:00 WIB.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | ObjectId | Auto | ID dokumen MongoDB | `ObjectId("68e9f0a1b2c3d4e5f6a7b8c9")` |
| `timestamp` | String | Yes | ISO 8601, waktu laporan dibuat | `"2026-08-27T23:00:00.000Z"` |
| `date_label` | String | Yes | Label tanggal (Bahasa Indonesia) | `"Selasa, 26 Agustus 2026"` |
| `report_text` | String | Yes | Teks laporan hasil AI | `"Laporan harian DNS..."` |
| `raw_rows` | Number | Yes | Jumlah entri DNS mentah | `150` |
| `ap_count` | Number | Yes | Jumlah access point | `3` |
| `raw_data` | String | Yes | JSON string data mentah | `"[{...}]"` |

**Contoh Dokumen:**
```json
{
  "_id": ObjectId("68e9f0a1b2c3d4e5f6a7b8c9"),
  "timestamp": "2026-08-27T23:00:00.000Z",
  "date_label": "Selasa, 26 Agustus 2026",
  "report_text": "Laporan harian DNS...\n\nAccess Point: Lab Komputer 1\n- Total query: 150\n- Domain berisiko (flag): 3",
  "raw_rows": 150,
  "ap_count": 3,
  "raw_data": "[{\"ap_name\":\"Lab Komputer 1\",\"domain\":\"youtube.com\",\"risk_level\":\"safe\",\"count\":45,\"client_count\":12}]"
}
```

**Ditulis oleh:** n8n `msda-daily-report.json` → MongoDB Insert (Arsip ke MongoDB)
**Dibaca oleh:** Go backend → Reports API, Dashboard Reports page

---

### `admins`

Akun administrator untuk autentikasi. **Dikelola manual** atau seed saat deployment.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | ObjectId | Auto | ID dokumen MongoDB | `ObjectId("69f0a1b2c3d4e5f6a7b8c9d0")` |
| `username` | String | Yes | Username admin | `"admin"` |
| `password_hash` | String | Yes | Hash bcrypt password | `"$2a$10$..."` |
| `role` | String | Yes | Role admin | `"admin"` \| `"viewer"` |
| `created_at` | String | Yes | ISO 8601, waktu akun dibuat | `"2026-08-27T00:00:00.000Z"` |

**Dikelola oleh:** Administrator (manual INSERT ke MongoDB)
**Dibaca oleh:** Go backend → Auth Handler (JWT login)

---

## Redis

### `rate:{client_ip}`

Rate-limit counter per IP client. **DISET OLEH n8n** setiap kali ada DNS query dari client. Digunakan untuk mendeteksi anomali (>1000 request/menit).

| Komponen | Keterangan | Contoh |
|----------|------------|--------|
| Key | `rate:{client_ip}` | `rate:192.168.10.45` |
| Value | Counter (integer) | `"42"` |
| TTL | 60 detik (auto-delete) | — |

**Kapan di-set:**
- n8n FASE 2: `INCR rate:{client_ip}` → increment counter
- n8n FASE 2: `EXPIRE rate:{client_ip} 60` → set TTL 60 detik

**Kapan dicek:**
- n8n FASE 2: `GET rate:{client_ip}` → cek apakah counter > 1000 (anomali)

**Redis Commands:**
```redis
INCR rate:192.168.10.45                    -- Increment counter
EXPIRE rate:192.168.10.45 60               -- Set TTL 60 detik
GET rate:192.168.10.45                      -- Baca counter
```

---

### `dedup:{domain}:{client_ip}`

Deduplikasi kombinasi domain + client. **DISET OLEH n8n** untuk mencegah insert duplikat ke MongoDB dalam jangka waktu pendek.

| Komponen | Keterangan | Contoh |
|----------|------------|--------|
| Key | `dedup:{domain}:{client_ip}` | `dedup:youtube.com:192.168.10.45` |
| Value | `"1"` (string) | `"1"` |
| TTL | 300 detik (5 menit) | — |

**Kapan dicek:**
- n8n FASE 3: `GET dedup:{domain}:{client_ip}` → jika ada, SKIP (sudah dicatat)

**Kapan di-set:**
- n8n FASE 3: `SET dedup:{domain}:{client_ip} "1" EX 300` → setelah insert ke MongoDB

**Redis Commands:**
```redis
GET dedup:youtube.com:192.168.10.45        -- Cek: ada = skip, kosong = proses
SET dedup:youtube.com:192.168.10.45 "1" EX 300  -- Set dedup (TTL 5 menit)
```

---

## Vector

### `vector-to-websocketn8n.jsonc`

Batch DNS query dari vector.dev (MikroTik) dikirim ke n8n via HTTP POST. **Payload dibungkus dalam objek `body`**.

**Format:** `{ body: Object[], headers: Object }`

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `body[].timestamp` | String | Yes | ISO 8601 nanodetik dari MikroTik | `"2026-08-07T09:45:00.123456789Z"` |
| `body[].source_type` | String | Yes | Sumber data | `"mikrotik_dns"` |
| `body[].ap_ip` | String | Yes | IP address Access Point | `"192.168.10.1"` |
| `body[].ap_name` | String | Yes | Nama/label AP (readable) | `"Lab Komputer 1"` |
| `body[].client_ip` | String | Yes | IP address client | `"192.168.10.45"` |
| `body[].domain` | String | Yes | Domain yang di-query | `"youtube.com"` |
| `headers.x-msda-token` | String | Yes | Token autentikasi | `"your-webhook-token"` |

**Contoh Payload:**
```json
{
  "body": [
    {
      "timestamp": "2026-08-07T09:45:00.123456789Z",
      "source_type": "mikrotik_dns",
      "ap_ip": "192.168.10.1",
      "ap_name": "Lab Komputer 1",
      "client_ip": "192.168.10.45",
      "domain": "youtube.com"
    },
    {
      "timestamp": "2026-08-07T09:45:01.002345123Z",
      "source_type": "mikrotik_dns",
      "ap_ip": "192.168.10.1",
      "ap_name": "Lab Komputer 1",
      "client_ip": "192.168.10.89",
      "domain": "instagram.com"
    }
  ],
  "headers": {
    "x-msda-token": "your-webhook-token"
  }
}
```

**Dikirim oleh:** vector.dev (collect dari MikroTik)
**Diterima oleh:** n8n Webhook `POST /webhook/msda-dns`

---

## Webhook Hit

### `n8n-to-backend.jsonc`

Webhook payload dari n8n ke Go backend. **DIKIRIM SAAT** ada blacklist alert atau batch summary.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `type_send` | String | Yes | Tipe notifikasi | `"blacklist_alert"` \| `"batch_summary"` |
| `data` | Object | Yes | Data notifikasi | Lihat di bawah |
| `data.domain` | String[] | Yes | List domain | `["totok777.com"]` |
| `data.group` | String | Yes | Nama group | `"Totok 777"` |
| `data.type` | String | Yes | Kategori domain | `"gambling"` |
| `data.client` | Object[] | Yes | Client yang akses | Lihat di bawah |
| `data.client[].ip` | String | Yes | IP client | `"192.168.10.88"` |
| `data.client[].access_count` | Number | Yes | Jumlah akses dalam batch | `5` |
| `data.client[].ap_info` | Object | Yes | Info Access Point | `{ "label": "Lab Komputer 1", "ip": "192.168.10.1" }` |
| `timestamp` | String | Yes | ISO 8601, waktu n8n kirim webhook | `"2026-08-27T05:34:55.293Z"` |

**Contoh Dokumen (blacklist_alert):**
```json
{
  "type_send": "blacklist_alert",
  "data": {
    "domain": ["totok777.com"],
    "group": "Totok 777",
    "type": "gambling",
    "client": [
      {
        "ip": "192.168.10.88",
        "access_count": 5,
        "ap_info": { "label": "Lab Komputer 1", "ip": "192.168.10.1" }
      }
    ]
  },
  "timestamp": "2026-08-27T05:34:55.293Z"
}
```

**Dikirim oleh:** n8n (webhook ke backend)
**Diterima oleh:** Go backend → Webhook Handler (`POST /api/v1/webhooks/n8n`)

---

## Koneksi Antar Data

```
MikroTik Router
  ↓ (DNS query logs)
vector.dev
  ↓ (HTTP POST batch ke n8n)
n8n (msda-dns-ingestion.json)
  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  FASE 1: Webhook Trigger                                            │
│  ┌─────────────────────────────────────┐                            │
│  │ POST /webhook/msda-dns              │                            │
│  │ Payload: { body: [...], headers }   │                            │
│  └──────────────┬──────────────────────┘                            │
│                 ↓                                                    │
│  FASE 2: Split + Validasi Token + Klasifikasi                       │
│  ┌─────────────────────────────────────┐                            │
│  │ Split Batch (per item)              │                            │
│  │ Validasi X-MSDA-Token header        │                            │
│  │ Klasifikasi Domain (risk_level)     │                            │
│  │ Rate Counter: INCR + EXPIRE 60s     │→── Redis rate:{client_ip}  │
│  └──────────────┬──────────────────────┘                            │
│                 ↓                                                    │
│  FASE 3: Anomaly Detection                                          │
│  ┌─────────────────────────────────────┐                            │
│  │ IF rate > 1000 → Slack Alert        │→── Slack (anomaly)         │
│  └──────────────┬──────────────────────┘                            │
│                 ↓                                                    │
│  FASE 4: Deduplikasi                                                │
│  ┌─────────────────────────────────────┐                            │
│  │ GET dedup:{domain}:{client_ip}      │←── Redis dedup             │
│  │ IF exists → SKIP                    │                            │
│  │ IF not exists → SET dedup EX 300    │→── Redis dedup             │
│  └──────────────┬──────────────────────┘                            │
│                 ↓                                                    │
│  FASE 5: Simpan + Alert                                             │
│  ┌─────────────────────────────────────┐                            │
│  │ MongoDB Insert → dns_events         │→── MongoDB dns_events      │
│  │ IF risk_level = "flag"              │                            │
│  │   → Slack Alert (domain berisiko)   │→── Slack (flag alert)      │
│  └──────────────┬──────────────────────┘                            │
│                 ↓                                                    │
│  FASE 6: Response                                                   │
│  ┌─────────────────────────────────────┐                            │
│  │ Respond 200 OK ke vector.dev        │                            │
│  └─────────────────────────────────────┘                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

n8n (msda-daily-report.json)
  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Trigger: Cron 0 16 * * 1-6 (23:00 WIB, Senin-Sabtu)               │
│                                                                     │
│  FASE 1: Ambil Data                                                 │
│  ┌─────────────────────────────────────┐                            │
│  │ MongoDB Aggregate → dns_events      │←── dns_events (kemarin)    │
│  │ MongoDB Find → ai_reports           │←── ai_reports (7 hari)     │
│  └──────────────┬──────────────────────┘                            │
│                 ↓                                                    │
│  FASE 2: Susun Prompt AI                                            │
│  ┌─────────────────────────────────────┐                            │
│  │ Gabung data + historis              │                            │
│  │ Buat prompt untuk Gemini            │                            │
│  └──────────────┬──────────────────────┘                            │
│                 ↓                                                    │
│  FASE 3: Generate Laporan                                           │
│  ┌─────────────────────────────────────┐                            │
│  │ Gemini 2.5 Flash API               │→── Google AI Studio         │
│  └──────────────┬──────────────────────┘                            │
│                 ↓                                                    │
│  FASE 4: Simpan + Kirim                                             │
│  ┌─────────────────────────────────────┐                            │
│  │ MongoDB Insert → ai_reports         │→── MongoDB ai_reports      │
│  │ Slack Kirim Laporan                 │→── Slack (laporan)         │
│  └─────────────────────────────────────┘                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Go Backend (msda-backend)
  ↓
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Webhook Handler: POST /api/v1/webhooks/n8n                         │
│  ┌─────────────────────────────────────┐                            │
│  │ Terima payload dari n8n             │                            │
│  │ Simpan ke notifications collection  │→── MongoDB notifications   │
│  │ Broadcast via WebSocket             │→── Dashboard (real-time)   │
│  └──────────────┬──────────────────────┘                            │
│                 ↓                                                    │
│  Dashboard API:                                                     │
│  ┌─────────────────────────────────────┐                            │
│  │ /api/v1/dashboard/summary           │←── dns_events aggregation  │
│  │ /api/v1/dashboard/lab-grid          │←── dns_events + seat map   │
│  │ /api/v1/dashboard/top-domains       │←── dns_events aggregation  │
│  │ /api/v1/dns-info                    │←── dns_info collection     │
│  │ /api/v1/blacklist                   │←── dns_blacklist (CRUD)    │
│  │ /api/v1/client-access               │←── client_access_dns       │
│  │ /api/v1/notifications               │←── notifications           │
│  └─────────────────────────────────────┘                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```
