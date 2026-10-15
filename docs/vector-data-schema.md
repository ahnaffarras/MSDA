# 📄 Spesifikasi Skema Data Log Parser (Vector → n8n Webhook)

Dokumen ini menjelaskan struktur data, spesifikasi JSON payload, tipe data, contoh payload mentah vs terstruktur, serta alur pengiriman data dari **Vector Log Parser** ke **n8n Webhook**.

---

## 1. Alur & Mekanisme Pengiriman Data

```
┌──────────────────┐           ┌────────────────────────────────┐           ┌──────────────────┐
│  Mikrotik AP     │ Syslog    │ Vector Log Parser              │ HTTP POST │ n8n Webhook      │
│  (RouterOS v7)   ├──────────►│ (Syslog Source -> Remap VRL)   ├──────────►│ (Node Webhook)   │
└──────────────────┘ UDP 514   └────────────────────────────────┘ JSON Batch└──────────────────┘
```

1. **Format Batching**: Vector **tidak** mengirimkan HTTP POST untuk setiap 1 query DNS (karena trafik bisa ribuan per menit). Vector mengumpulkan log ke dalam bentuk **Array of JSON Objects (Batch)**.
2. **Kriteria Trigger Batch**:
   - **Jumlah Event**: Maksimal **100 event** per batch (`batch.max_events = 100`).
   - **Batas Waktu (Timeout)**: Maksimal **10 detik** (`batch.timeout_secs = 10`). Mana pun yang tercapai lebih dulu akan memicu pengiriman HTTP POST.
3. **Keamanan (Authentication Header)**:
   Vector menyertakan kustom header `X-MSDA-Token` pada setiap request untuk memvalidasi bahwa payload benar-benar berasal dari vector resmi.

---

## 2. Struktur Payload JSON (Array of Objects)

Payload HTTP POST Body yang diterima oleh n8n berupa **Array JSON**:

```json
[
  {
    "timestamp": "2026-08-07T09:45:00.123456789Z",
    "source_type": "mikrotik_dns",
    "ap_ip": "192.168.10.1",
    "ap_name": "192.168.10.1",
    "client_ip": "192.168.10.45",
    "domain": "youtube.com"
  },
  {
    "timestamp": "2026-08-07T09:45:01.002134512Z",
    "source_type": "mikrotik_dns",
    "ap_ip": "192.168.10.1",
    "ap_name": "192.168.10.1",
    "client_ip": "192.168.10.88",
    "domain": "instagram.com"
  }
]
```

---

## 3. Deskripsi & Kamus Data (Field Dictionary)

| Nama Field | Tipe Data | Contoh Nilai | Deskripsi & Kegunaan di n8n / AI |
| :--- | :--- | :--- | :--- |
| **`timestamp`** | `String` (ISO 8601 UTC) | `"2026-08-07T09:45:00.123Z"` | Waktu presisi saat log DNS ditangkap dan diproses oleh Vector. Digunakan untuk agregasi time-series & grafik tren di Phase 2. |
| **`source_type`** | `String` | `"mikrotik_dns"` | Identifikasi tipe sumber data log. Memudahkan filter jika di masa depan ada sumber log lain (misal: Firewall log). |
| **`ap_ip`** | `String` (IPv4) | `"192.168.10.1"` | IP Address dari Router/Access Point Mikrotik pengirim log syslog. |
| **`ap_name`** | `String` | `"192.168.10.1"` atau `"AP_Lantai2"` | Identitas/Nama Access Point. Diperlukan untuk pengelompokan laporan per AP oleh Google AI Studio. |
| **`client_ip`** | `String` (IPv4) | `"192.168.10.45"` | IP Address perangkat pengguna (HP/Laptop) yang melakukan query DNS. Digunakan AI untuk menghitung jumlah IP unik per AP. |
| **`domain`** | `String` | `"youtube.com"` | Domain/hostname yang diakses oleh klien (sudah dibersihkan dari trailing dot `.`). Digunakan AI untuk menentukan **Top 3/Top 5 Domains**. |

---

## 4. Transformasi Data (Raw Syslog → Clean JSON)

### Log Mentah (Raw Syslog from Mikrotik RouterOS v7):
```text
<134>Aug  7 09:45:00 RouterMikrotik 192.168.10.1 dns,packet query from 192.168.10.45:38291: #57 youtube.com. A
```

### Hasil Transformasi VRL (Vector Remap Language):
1. **Regex Parsing 1 (Router IP & Body)**:
   Memisahkan IP Pengirim (`192.168.10.1`) dari sisa isi pesan log.
2. **Regex Parsing 2 (Client IP & Domain)**:
   Mengambil IP Klien (`192.168.10.45`) dan Domain (`youtube.com.`).
3. **Data Sanitization**:
   Menghapus titik di akhir domain (`rtrim(domain, ".")`) dan spasi berlebih.
4. **Data Filtering**:
   Baris log non-DNS atau baris log yang gagal diparse (tanpa `domain` & `client_ip`) akan otomatis dibuang dan **tidak** dikirim ke n8n.

---

## 5. HTTP Header Specification

Setiap payload HTTP POST dari Vector membawa HTTP Headers berikut:

```http
POST /webhook/msda-dns HTTP/1.1
Host: n8n:5678
Content-Type: application/json
<<<<<<< HEAD
X-MSDA-Token: changeme-token
User-Agent: Vector/0.38.0
```

> 💡 **Rekomendasi di n8n**: Gunakan Node Webhook di n8n dengan opsi *Header Authentication* atau atur *IF Node* untuk menguji apakah `$header["x-msda-token"] == "changeme-token"`.
=======
X-MSDA-Token: <MSDA_WEBHOOK_TOKEN>
User-Agent: Vector/0.38.0
```

> 💡 **Rekomendasi di n8n**: Gunakan Node Webhook di n8n dengan opsi *Header Authentication* atau atur *IF Node* untuk menguji apakah `$header["x-msda-token"] == "<MSDA_WEBHOOK_TOKEN>"`.
>>>>>>> 2fdbce0 (updating documentation)
