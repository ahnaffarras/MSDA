# MSDA — API Structure

> Dibuat berdasarkan `STRUCTURE.md`, `WORKFLOWS.md`, dan seluruh data model komponen di MSDA.
>
> Konteks: n8n (Vector → n8n → MongoDB) sudah menangani **ingest & processing**. API ini adalah **backend Go** yang jadi jembatan antara MongoDB/Redis dan **dashboard Next.js** — untuk read data, admin CRUD blacklist, terima webhook dari n8n, dan broadcast realtime ke dashboard.

---

## 0. Prinsip Desain

- **Base URL:** `/api/v1`
- **Format:** JSON, `snake_case` sama persis dengan field MongoDB (biar gak perlu mapping ekstra di frontend).
- **Auth:** JWT Bearer token untuk endpoint admin (CRUD blacklist, dsb). Endpoint read-only dashboard bisa pakai auth session biasa.
- **`risk_level` / klasifikasi:** semua level risiko (`type`, `blocked_level`, dsb.) **sudah final dari MongoDB** (hasil AI Analyzer / admin) — API **tidak boleh** re-classify di response, tinggal pass-through. *(Ini konsisten sama fix yang sudah kamu kerjain kemarin soal risk_level di frontend.)*
- **Pagination:** query param `?page=1&limit=20`, response selalu punya `meta: { page, limit, total, total_pages }`.
- **Realtime:** WebSocket (`/ws/dashboard`) untuk push data dari webhook n8n ke dashboard tanpa polling.

---

## 1. Auth

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| POST | `/api/v1/auth/login` | Login admin (username/password → JWT) |
| POST | `/api/v1/auth/logout` | Invalidate session/token |
| GET | `/api/v1/auth/me` | Info admin yang login |

---

## 2. Dashboard (Overview)

Dipakai buat halaman utama dashboard (kartu ringkasan + seating-chart grid lab).

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/api/v1/dashboard/summary` | Ringkasan hari ini: `total_queries`, `unique_domains`, `new_domains`, `blacklist_hits`, `blacklist_clients`, `cached_responses` (agregat dari `webhook-hit`/`client_access_dns`) |
| GET | `/api/v1/dashboard/summary?range=today\|7d\|30d` | Ringkasan dengan rentang waktu |
| GET | `/api/v1/dashboard/lab-grid` | Data untuk seating-chart grid: per Access Point → daftar client aktif + status terakhir (aman/blacklist) |
| GET | `/api/v1/dashboard/top-domains` | Top domain diakses (query param `type=gambling\|adult\|...` opsional) |
| GET | `/api/v1/dashboard/top-clients` | Top client_ip dengan akses blacklist terbanyak |

**Contoh response `summary`:**
```json
{
  "data": {
    "total_queries": 150,
    "unique_domains": 45,
    "new_domains": 3,
    "blacklist_hits": 12,
    "blacklist_clients": 5,
    "cached_responses": 80,
    "range": "today"
  }
}
```

---

## 3. DNS Info (`dns_info` collection — read only)

Data ini murni hasil AI Analyzer Worker, jadi API **tidak menyediakan create/update manual** — hanya read. (Update `ip_scan` dilakukan oleh Cron trigger langsung ke MongoDB, bukan lewat API ini.)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/api/v1/dns-info` | List semua domain ter-enrich. Filter: `?type=`, `?group=`, `?search=` (domain/company), `?page=&limit=` |
| GET | `/api/v1/dns-info/:domain` | Detail satu domain (full: `info_app`, `ip_scan[]`, `host_isp`, `ptr_hostname`, `last_verified`) |
| GET | `/api/v1/dns-info/groups` | Daftar unik `group` (buat dropdown filter di frontend) |
| GET | `/api/v1/dns-info/types` | Daftar unik `type` (`social_media`, `streaming`, `gaming`, `gambling`, `adult`, `cloud`, `cdn`, `educational`, `other`) |

**Contoh response `GET /dns-info/:domain`:**
```json
{
  "data": {
    "domain": "instagram.com",
    "group": "Instagram",
    "type": "social_media",
    "info_app": {
      "platform": ["mobile", "desktop", "web"],
      "company_responsible": "Meta Platforms, Inc.",
      "owner": "Meta Platforms, Inc."
    },
    "ip_scan": [
      { "ip": "157.240.1.35", "type": "A", "geo": "Singapore, SG" }
    ],
    "ptr_hostname": "instagram-p42-shv-01-cgk1.fbcdn.net",
    "host_isp": { "city": "Jakarta", "region": "ID", "org": "Facebook, Inc.", "asn": "AS32934" },
    "last_verified": "2026-08-27T05:47:51.788Z",
    "timestamp": "2026-08-27T05:47:51.788Z"
  }
}
```

---

## 4. DNS Blacklist (`dns_blacklist` collection — full CRUD, admin managed)

Ini satu-satunya koleksi yang **memang diatur manual oleh admin lewat dashboard** — jadi butuh full CRUD + auth.

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/api/v1/blacklist` | List blacklist. Filter: `?type=`, `?blocked_level=`, `?is_active=`, `?search=` |
| GET | `/api/v1/blacklist/:id` | Detail satu entry |
| POST | `/api/v1/blacklist` | Tambah entry baru (`blocked_level`, `domain` atau `group`, `type`, `is_active`) |
| PUT | `/api/v1/blacklist/:id` | Update entry |
| PATCH | `/api/v1/blacklist/:id/toggle-active` | Toggle `is_active` cepat (dari switch UI) |
| DELETE | `/api/v1/blacklist/:id` | Hapus entry |

**Validasi penting (ikuti STRUCTURE.md):**
- Jika `blocked_level = "domain"` → field `domain` wajib, `group` opsional.
- Jika `blocked_level = "group"` → field `group` wajib, `domain` opsional.
- `type` harus salah satu dari: `gambling | adult | malware | phishing | crypto_miner | custom`.

**Contoh request `POST /blacklist`:**
```json
{
  "blocked_level": "group",
  "group": "Totok 777",
  "type": "gambling",
  "is_active": true
}
```

---

## 5. Client Access Logs (`client_access_dns` collection — read only)

Log realtime, ditulis oleh n8n. API hanya read + agregasi untuk laporan.

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/api/v1/client-access` | List log akses. Filter: `?domain=`, `?client_ip=`, `?group=`, `?action=`, `?ap_ip=`, `?from=&to=` (ISO date), `?page=&limit=` |
| GET | `/api/v1/client-access/:id` | Detail satu log |
| GET | `/api/v1/client-access/stats` | Agregasi: akses per hari, per `type`, per AP (buat chart) |
| GET | `/api/v1/client-access/export?format=csv` | Export laporan akses blacklist |

---

## 6. Access Points (derived dari `ap_info`)

Dipakai khusus buat seating-chart grid lab yang lagi kamu bangun di dashboard.

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/api/v1/access-points` | List unik AP (`label`, `ip`) + jumlah client aktif per AP |
| GET | `/api/v1/access-points/:ap_ip/clients` | List client_ip yang tercatat di bawah AP tsb + status terakhir |

---

## 7. Webhook Receiver (dari n8n)

Endpoint ini yang dipanggil n8n node `Third Party Webhook` (FASE 6) — ganti/lengkapi `https://external-service.example.com/webhook` di WORKFLOWS.md dengan endpoint backend ini.

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| POST | `/api/v1/webhooks/n8n` | Terima payload `type_send: "blacklist_alert" \| "batch_summary"` dari n8n → simpan ke `notifications` (opsional) → broadcast ke `/ws/dashboard` |

**Request body** = persis struktur `n8n-to-realtime-backend-administrator.jsonc` (lihat STRUCTURE.md § Webhook Hit). Backend harus:
1. Validasi `type_send`.
2. Kalau `blacklist_alert` → broadcast realtime ke dashboard yang lagi buka (WS) + optional push ke mobile.
3. Simpan sebagai notification history buat di-list ulang di `/api/v1/notifications`.

Response cukup `200 { "received": true }` — jangan bikin n8n nunggu proses berat, proses async di background.

---

## 8. Notifications (history alert untuk dashboard)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/api/v1/notifications` | List notifikasi (`blacklist_alert` / `batch_summary`) terbaru, buat lonceng notif di dashboard |
| PATCH | `/api/v1/notifications/:id/read` | Tandai sudah dibaca |
| PATCH | `/api/v1/notifications/read-all` | Tandai semua sudah dibaca |

---

## 9. Realtime (WebSocket)

| Path | Fungsi |
|------|--------|
| `WS /ws/dashboard` | Client dashboard subscribe di sini. Server push event tiap kali `POST /webhooks/n8n` masuk dengan `type_send: blacklist_alert`, juga push update ringan untuk `dashboard/summary` counters. |

**Contoh event yang di-push:**
```json
{
  "event": "blacklist_alert",
  "data": {
    "domain": ["apis.instagram.com"],
    "group": "Totok 777",
    "type": "gambling",
    "client": [{ "ip": "192.168.10.88", "access_count": 5, "ap_info": { "label": "AP-GedungA-Lantai2", "ip": "192.168.10.1" } }]
  },
  "timestamp": "2026-08-27T05:34:55.293Z"
}
```

---

## 10. Struktur Folder Go (saran, sesuai stack kamu)

```
msda-backend/
├── cmd/
│   └── api/
│       └── main.go
├── internal/
│   ├── handler/          # HTTP handlers per resource (dns_info, blacklist, client_access, webhook, ws)
│   ├── service/          # Business logic (validasi blocked_level, agregasi summary, dsb.)
│   ├── repository/       # Mongo query layer, satu file per collection
│   ├── model/            # Struct: DNSInfo, DNSBlacklist, ClientAccessDNS, WebhookPayload
│   ├── middleware/        # JWT auth, logging, CORS
│   └── ws/                # WebSocket hub (broadcast ke dashboard)
├── pkg/
│   ├── mongodb/           # Koneksi & helper Mongo
│   └── redis/             # Koneksi Redis (kalau backend perlu baca queue/notif status)
├── .env
├── docker-compose.yml
└── go.mod
```

**Mapping collection → repository:**

| Mongo Collection | Repository | Dipakai di endpoint |
|---|---|---|
| `dns_info` | `dnsinfo_repo.go` | §3 |
| `dns_blacklist` | `blacklist_repo.go` | §4 (CRUD) |
| `client_access_dns` | `clientaccess_repo.go` | §5, §6 |

---

## 11. Ringkasan Endpoint (cepat lihat)

```
Auth
  POST   /api/v1/auth/login
  POST   /api/v1/auth/logout
  GET    /api/v1/auth/me

Dashboard
  GET    /api/v1/dashboard/summary
  GET    /api/v1/dashboard/lab-grid
  GET    /api/v1/dashboard/top-domains
  GET    /api/v1/dashboard/top-clients

DNS Info (read-only)
  GET    /api/v1/dns-info
  GET    /api/v1/dns-info/:domain
  GET    /api/v1/dns-info/groups
  GET    /api/v1/dns-info/types

DNS Blacklist (CRUD, admin)
  GET    /api/v1/blacklist
  GET    /api/v1/blacklist/:id
  POST   /api/v1/blacklist
  PUT    /api/v1/blacklist/:id
  PATCH  /api/v1/blacklist/:id/toggle-active
  DELETE /api/v1/blacklist/:id

Client Access (read-only)
  GET    /api/v1/client-access
  GET    /api/v1/client-access/:id
  GET    /api/v1/client-access/stats
  GET    /api/v1/client-access/export

Access Points
  GET    /api/v1/access-points
  GET    /api/v1/access-points/:ap_ip/clients

Webhook (dari n8n)
  POST   /api/v1/webhooks/n8n

Notifications
  GET    /api/v1/notifications
  PATCH  /api/v1/notifications/:id/read
  PATCH  /api/v1/notifications/read-all

Realtime
  WS     /ws/dashboard
```

---

## Catatan

- Semua endpoint di §3, §5, §6 **read-only** karena data itu ditulis otomatis oleh n8n/AI Analyzer/Cron — API backend gak perlu (dan sebaiknya gak boleh) nulis manual ke situ, biar gak bentrok sama pipeline.
- Satu-satunya resource yang butuh CRUD penuh dari dashboard adalah `dns_blacklist` (§4), karena itu memang dikelola manual oleh admin.
- Kalau nanti mau tambah fitur "admin override risk level" atau semacam whitelist manual, itu jadi collection baru (bukan modifikasi `dns_info`) supaya hasil AI Analyzer tetap murni sebagai audit trail.
