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
│   ├── audit_logs.jsonc            # Jejak aksi pengguna dashboard (ditulis dashboard)
│   ├── notification_settings.jsonc # Pengaturan kanal notifikasi (dibaca n8n)
│   └── admins.jsonc                # DEPRECATED: login backend lama, tidak dipakai lagi
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
| `expires_at` | Date \| null | No | **Baru.** Akhir masa blokir. `null`/tidak ada = permanen. Dashboard mengisinya sebagai akhir hari WIB (23:59:59.999) | `ISODate("2026-12-31T16:59:59.999Z")` |
| `source` | String | No | **Baru.** Asal entri. Default `manual` bila tidak ada | `"manual"` \| `"feed"` \| `"auto"` \| `"import"` |
| `note` | String | No | **Baru.** Catatan (maks. 300). Disalin juga ke `description` bila `description` kosong | `"Sesuai tata tertib"` |
| `block_mode` | String | No | **Baru (DNS enforcement).** `alert` (default bila kosong) = hanya memantau; `enforce` = diblokir di DNS lewat AdGuard Home **dan** tetap memicu alert | `"alert"` \| `"enforce"` |
| `include_subdomains` | Boolean | No | **Baru.** Default `true` → aturan `\|\|domain^` (domain + semua subdomain). `false` → `\|domain^` (hanya domain persis) | `true` |
| `enforce_status` | String | No | **Baru.** Diisi dashboard/backend, hanya untuk `block_mode:"enforce"`: `pending` \| `synced` \| `error` | `"synced"` |
| `enforce_synced_at` | Date | No | **Baru.** Waktu terakhir aturan berhasil disinkronkan | `ISODate("2026-10-15T08:00:00Z")` |
| `enforce_error` | String | No | **Baru.** Alasan, hanya bila `enforce_status` ≠ `synced` | `"TLD / public suffix cannot be blocked"` |

> **DNS enforcement (opsional).** Sumber kebenaran aturan AdGuard adalah koleksi ini. Backend Go membangun ulang aturan secara penuh dan idempoten (lihat `docs/adguard.md`). Entri `is_active:false`, kedaluwarsa, atau tercakup `dns_allowlist` **tidak** ikut aturan. Entri `blocked_level:"group"` diperluas backend menjadi semua domain `dns_info` dengan `group` yang sama. **Catatan n8n v9:** workflow saat ini membuang entri tanpa `domain`, jadi entri `group` tidak memicu alert walau didukung di DNS.
>
> **`ip_access_dns`** mendapat field opsional `block_mode` dan `enforced` (boolean). `action:"blocked"` **tetap** berarti "cocok blocklist"; UI hanya menampilkan "Blocked" bila `enforced === true`. Koleksi baru `adguard_sync_state` (satu dokumen `_id:"main"`): `last_hash`, `last_sync_at`, `rule_count`, `status` (`ok`\|`error`), `error`, `agh_version`.

> **Kontrak untuk n8n (semua aditif).** Sebuah entri *hanya berlaku* bila `is_active != false` **dan** (`expires_at` kosong **atau** `expires_at > sekarang`) **dan** domain tidak tercakup `dns_allowlist`. n8n yang belum mengenal field baru tetap berjalan seperti sebelumnya, tetapi akan tetap memblokir entri yang sudah kedaluwarsa sampai logikanya diperbarui.

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
| `type_send` | String | Yes | Tipe notifikasi | `"blacklist_alert"` \| `"batch_summary"` \| `"anomaly_alert"` \| `"system_alert"` |
| `data` | Object | Yes | Data notifikasi | Lihat di bawah |
| `data.domain` | String[] | Yes | List domain | `["totok777.com"]` |
| `data.group` | String | Yes | Nama group | `"Totok 777"` |
| `data.type` | String | Yes | Kategori domain | `"gambling"` |
| `data.client` | Object[] | Yes | Client yang akses | Lihat di bawah |
| `data.client[].ip` | String | Yes | IP client | `"192.168.10.88"` |
| `data.client[].access_count` | Number | Yes | Jumlah akses | `5` |
| `data.client[].ap_info` | Object | Yes | Info Access Point | `{ "label": "Lab Komputer 1", "ip": "192.168.10.1" }` |
| `is_read` | Boolean | Yes | Sudah dibaca admin (dijaga sinkron dengan `status`) | `false` \| `true` |
| `timestamp` | String | Yes | ISO 8601, waktu notifikasi | `"2026-08-27T05:34:55.293Z"` |
| `severity` | String | No | Tingkat urgensi. Default `warning` bila tidak dikirim | `"info"` \| `"warning"` \| `"critical"` |
| `dedup_key` | String | No | Kunci pengelompokan alert sejenis (diisi n8n, maks. 200 karakter) | `"blacklist:totok777.com:192.168.10.88"` |
| `status` | String | No | Alur penanganan. Default `new` | `"new"` \| `"acknowledged"` \| `"resolved"` |
| `ack_by` | String | No | Pengguna dashboard yang terakhir mengubah status | `"admin"` |
| `ack_at` | Date | No | Waktu pertama kali di-acknowledge | `ISODate("2026-08-27T06:00:00Z")` |
| `resolved_at` | Date | No | Waktu di-resolve | `ISODate("2026-08-27T07:10:00Z")` |
| `note` | String | No | Catatan penanganan (maks. 500 karakter) | `"Sudah ditegur"` |

> **Kompatibel mundur.** Semua field baru opsional. Dokumen lama tanpa `status`/`severity` dibaca sebagai `status = new` (bila `is_read=false`) atau `acknowledged` (bila `is_read=true`), dan `severity = warning`. Payload webhook lama tetap diterima.

**Index:** `timestamp`, `status+timestamp`, `severity+timestamp`, `is_read+timestamp`, `dedup_key` (sparse). Dibuat otomatis saat backend start.

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

### `admins` (DEPRECATED)

Dipakai login JWT backend Go yang **sudah dihapus** (tugas A3). Backend tidak lagi membaca koleksi ini. Login dashboard memakai `dashboard_users` / `dashboard_sessions` / `dashboard_login_throttle` (dikelola dashboard). Koleksi `admins` boleh dihapus dari database setelah dipastikan tidak diperlukan; fitur Storage menandainya sebagai koleksi terlindungi sehingga tidak ikut dibersihkan otomatis.

---

### `audit_logs`

Jejak aksi pengguna dashboard (siapa melakukan apa, kapan, dari IP mana). **Ditulis oleh dashboard** (`lib/audit.ts`), dibaca halaman `/audit` (khusus admin). Retensi default **180 hari**, diatur di halaman Storage & Cleanup (minimum 30 hari).

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | ObjectId | Auto | | |
| `ts` | Date | Yes | Waktu kejadian | `ISODate("2026-10-15T03:00:00Z")` |
| `actor_id` | String | No | ID pengguna dashboard | `"6710..."` |
| `actor_username` | String | No | Username pelaku | `"admin"` |
| `action` | String | Yes | Kode aksi (lihat bawah) | `"blacklist.create"` |
| `target_type` | String | No | Jenis objek | `"blacklist"` |
| `target_id` | String | No | ID/nama objek | `"6711..."` |
| `ip` | String | No | IP klien | `"10.0.0.7"` |
| `meta` | Object | No | Detail tambahan. Kunci berisi `password/token/secret/cookie/authorization/api_key` otomatis dibuang | `{ "domains": ["x.com"] }` |

**Kode aksi:** `auth.login`, `auth.login_failed`, `auth.login_locked`, `auth.logout`, `auth.password_change`, `user.create`, `user.update`, `user.reset_password`, `user.change_role`, `user.set_active`, `user.delete`, `blacklist.create`, `blacklist.update`, `blacklist.toggle`, `blacklist.delete`, `storage.settings_update`, `storage.cleanup_run`, `storage.compact`, `storage.snapshot`, `notification.status`, `notification.bulk_status`, `notification.read_all`, `notification_settings.update`, `notification_settings.test`, `audit.export`, `privacy.update`, `client_device.save`, `client_device.delete`, `client_device.import`, `allowlist.create`, `allowlist.delete`, `blacklist.import`, `blacklist.bulk`.

**Index:** `ts`, `actor_username+ts`, `action+ts`.

---

### `notification_settings`

Satu dokumen (`_id: "global"`), **ditulis dashboard** (Notifications → Settings, admin), **dibaca n8n** untuk memutuskan kanal, severity minimum, dan jam tenang. Token bot Telegram/Slack disimpan di n8n, **bukan** di sini.

```json
{
  "_id": "global",
  "channels": {
    "slack":    { "enabled": true,  "min_severity": "warning" },
    "telegram": { "enabled": false, "min_severity": "critical" }
  },
  "digest_minutes": 0,
  "quiet_hours": { "enabled": false, "start": "22:00", "end": "06:00", "tz": "Asia/Jakarta" },
  "updated_by": "admin",
  "updated_at": "2026-10-15T03:00:00.000Z"
}
```

| Field | Aturan |
|-------|--------|
| `channels.<slack\|telegram>.enabled` | boolean |
| `channels.<...>.min_severity` | `info` \| `warning` \| `critical`; notifikasi di bawah nilai ini tidak dikirim ke kanal tersebut |
| `digest_minutes` | bilangan bulat 0–1440. `0` = kirim langsung; `>0` = kumpulkan lalu kirim ringkasan tiap N menit |
| `quiet_hours` | `start`/`end` format `HH:MM` (24 jam), `tz` zona waktu IANA. Bila `enabled`, `start` ≠ `end`. Jendela yang melewati tengah malam (22:00→06:00) valid |

Dokumen tidak ada = pakai nilai default di atas (kecuali `updated_*`).

---

### `dns_allowlist`

Domain yang **tidak pernah diblokir**. **Allowlist menang atas blocklist.** Entri `example.com` juga mencakup semua subdomainnya (aturan yang sama dengan blocklist). Ditulis dashboard (Blocklist → Allowlist, admin); **dibaca n8n**.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | ObjectId | Auto | | |
| `domain` | String | Yes | Domain (huruf kecil, tanpa skema/path) | `"google.com"` |
| `note` | String | No | Alasan (maks. 300) | `"Dibutuhkan layanan sekolah"` |
| `created_by` | String | No | Username admin | `"admin"` |
| `created_at` | Date | Yes | | |

Dashboard menolak menambah ke blocklist domain yang tercakup allowlist (alasan `allowlisted`), dan menandai entri blocklist lama yang tertimpa sebagai *Overridden by allowlist*. **Index:** `domain`.

---

### `client_devices`

Label perangkat/klien (C3). Ditulis dashboard (halaman Clients), tidak dibaca n8n.

| Field | Tipe | Required | Keterangan | Contoh |
|-------|------|----------|------------|--------|
| `_id` | String | Yes | `mac:<mac>` bila MAC ada, kalau tidak `ip:<ip>` — identitas perangkat tetap saat IP berganti | `"mac:aa:bb:cc:dd:ee:07"` |
| `ip` | String | Yes | IP saat ini | `"192.168.10.25"` |
| `mac` | String | No | Huruf kecil, dipisah `:` | `"aa:bb:cc:dd:ee:07"` |
| `hostname` | String | No | | `"lab1-pc07"` |
| `label` | String | Yes | Nama yang diberikan admin (maks. 80) | `"Lab 1 — PC 07"` |
| `owner` | String | No | Maks. 80 | `"Budi"` |
| `note` | String | No | Maks. 300 | |
| `ip_history` | Array | Yes | `[{ ip, until }]`, IP sebelumnya (maks. 20 terakhir), diisi saat perangkat ber-MAC berpindah IP | |
| `first_seen` / `last_seen` | Date | Yes | Waktu label dibuat / terakhir disimpan. *Aktivitas jaringan sebenarnya dihitung langsung dari `ip_access_dns` di halaman detail klien.* | |
| `source` | String | Yes | `manual` \| `csv` \| `dhcp` (lease DHCP MikroTik: rencana) | |
| `created_at`, `updated_at` | Date | Yes | | |

**Impor CSV:** header wajib memuat `ip` dan `label`; opsional `mac, hostname, owner, note`. Maks. 5.000 baris dan 1 MB; baris tidak valid dilewati dan dilaporkan dengan nomor barisnya. **Index:** `ip`, `mac` (sparse), `updated_at`.

---

### `app_settings`

Pengaturan dashboard yang kecil, satu dokumen per topik. Saat ini hanya `_id: "privacy"`:

```json
{ "_id": "privacy", "mask_viewer_ips": false, "updated_by": "admin", "updated_at": "2026-10-15T03:00:00.000Z" }
```

`mask_viewer_ips: true` → peran `viewer` melihat IP klien tersamar (`10.0.0.x·a3f2c1`: oktet terakhir disembunyikan, tag HMAC menjaga klien tetap terbedakan), tidak bisa membuka detail klien/label, dan tidak bisa mengekspor data klien. Admin selalu melihat IP asli. Kunci HMAC: `MSDA_PRIVACY_KEY` (default: `MSDA_INTERNAL_TOKEN`).

---

## Kontrak Webhook n8n → Backend (`POST /api/v1/webhooks/n8n`)

Header `X-MSDA-Token: <MSDA_WEBHOOK_TOKEN>`. Tanpa/salah token → `401`; bila backend sendiri tidak punya token terkonfigurasi → `503` (gagal-tertutup).

```bash
# Payload lama (tanpa severity/dedup_key) — tetap diterima, severity jadi "warning"
curl -sS -X POST http://backend:8080/api/v1/webhooks/n8n \
  -H "Content-Type: application/json" -H "X-MSDA-Token: $MSDA_WEBHOOK_TOKEN" \
  -d '{"type_send":"blacklist_alert","data":{"domain":["totok777.com"],"group":"Judi Online","type":"gambling","client":[{"ip":"192.168.10.88","access_count":5,"ap_info":{"label":"Lab 1","ip":"192.168.10.1"}}]},"timestamp":"2026-10-15T03:00:00Z"}'

# Payload baru
curl -sS -X POST http://backend:8080/api/v1/webhooks/n8n \
  -H "Content-Type: application/json" -H "X-MSDA-Token: $MSDA_WEBHOOK_TOKEN" \
  -d '{"type_send":"anomaly_alert","severity":"critical","dedup_key":"anomaly:10.0.0.5:2026-10-15","data":{"domain":["x.example"],"group":"","type":"","client":[]},"timestamp":"2026-10-15T03:00:00Z"}'
```

Nilai `type_send` yang valid: `blacklist_alert`, `batch_summary`, `anomaly_alert`, `system_alert`. `severity` yang valid: `info`, `warning`, `critical`. Nilai lain → `400`.

> Backend ini **tidak dapat dijangkau dari host** (tidak ada port yang dipublikasikan); panggilan di atas dijalankan dari dalam jaringan Docker (mis. n8n). Untuk uji lokal pakai `docker-compose.dev.yml` lalu `http://127.0.0.1:8081`.

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
| `type_send` | String | Yes | Tipe notifikasi | `"blacklist_alert"` \| `"batch_summary"` \| `"anomaly_alert"` \| `"system_alert"` |
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
