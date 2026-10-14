# 🧪 Panduan Testing Pipeline (Mikrotik → Vector → JSON Schema)

Dokumen ini berisi langkah-langkah **End-to-End Verification** untuk memastikan:
1. Mikrotik berhasil memicu dan mengirim Syslog DNS (Port 514 UDP).
2. Vector menerima log mentah dan mem-parse menjadi skema JSON yang valid.
3. Payload JSON dapat diamati secara real-time atau diuji ke receiver mock/n8n.

---

## 📋 Diagram Tahap Pengujian

```
[1. Test Mikrotik Log] ──► [2. Cek UDP 514 Listener] ──► [3. Cek Output JSON Vector Log]
```

---

## Tahap 1: Verifikasi Mikrotik (Kirim Syslog)

### 1.1 Pastikan `:local syslogServerIP` Sudah Benar
Buka terminal SSH/Winbox Mikrotik dan cek apakah action `msda-remote-syslog` mengarah ke IP Docker Host:
```routeros
/system logging action print where name="msda-remote-syslog"
```
*Pastikan parameter `remote` berisi IP Komputer/Server Docker kamu (bukan `127.0.0.1` atau `localhost`).*

### 1.2 Generate Traffic DNS dari Mikrotik
Picu pencarian DNS dari terminal Mikrotik untuk menghasilkan log:
```routeros
:resolve google.com
:resolve youtube.com
:resolve tiktok.com
```

### 1.3 Cek Log di Mikrotik Lokal
```routeros
/log print where topics~"dns"
```
**Ekspektasi**: Muncul log bertuliskan `dns,packet query from ...`.

---

## Tahap 2: Jalankan Container Vector

Masuk ke direktori Docker di server/laptop tempat Docker berada:

```bash
cd msda/infrastructure/docker

# 1. Jalankan container vector (atau seluruh stack)
docker compose up -d vector

# 2. Cek status container
docker compose ps
```
**Ekspektasi**: Status `msda-vector` adalah **Up (healthy/running)** dan port `514/udp` terbuka.

---

## Tahap 3: Verifikasi Vector Log Parser (Cek JSON Schema)

Karena Vector sudah dikonfigurasi dengan **Console Sink** (`[sinks.debug_console]`), setiap log DNS valid yang diterima akan langsung dicetak sebagai **JSON terstruktur** di console container.

### 3.1 Amati Live Stream Log Vector
Jalankan perintah ini di terminal server Docker:
```bash
docker logs -f msda-vector
```

### 3.2 Lakukan Test Query Lagi dari Klien / Mikrotik
Dari HP/Laptop yang terhubung ke Mikrotik (atau dari terminal Mikrotik), lakukan browsing atau `nslookup`:
```bash
nslookup wikipedia.org
```

### 3.3 Verifikasi Output JSON di Vector Console
**Ekspektasi Output di Terminal Docker (`docker logs -f msda-vector`)**:

```json
{"ap_ip":"192.168.10.1","ap_name":"192.168.10.1","client_ip":"192.168.10.45","domain":"wikipedia.org","source_type":"mikrotik_dns","timestamp":"2026-08-07T10:40:00.123456789Z"}
```

---

## 📊 Checklist Verifikasi Kesesuaian Skema (Schema Validation)

Bandingkan output JSON yang keluar di console dengan checklist berikut:

- [ ] **`timestamp`**: Terisi format ISO 8601 UTC (misal: `"2026-08-07T..."`).
- [ ] **`source_type`**: Terisi string `"mikrotik_dns"`.
- [ ] **`ap_ip` / `ap_name`**: Terisi IP Router/AP Mikrotik pengirim log.
- [ ] **`client_ip`**: Terisi IP Klien peranti HP/Laptop pengakses.
- [ ] **`domain`**: Terisi nama domain bersih tanpa titik trailing (misal: `"wikipedia.org"`, bukan `"wikipedia.org."`).

---

## 🛠 Troubleshooting Cepat (Jika Log Tidak Muncul)

| Masalah / Gejala | Kemungkinan Penyebab | Cara Memperbaiki |
| :--- | :--- | :--- |
| `docker logs -f msda-vector` **kosong** saat traffic dibuat | 1. IP Target Syslog di Mikrotik salah.<br>2. Firewall OS (Windows Firewall / `ufw`) memblokir Port 514 UDP. | 1. Cek `syslogServerIP` di Mikrotik.<br>2. Buka inbound rule Port `514 UDP` di Firewall Host. |
| Log masuk tapi ada error **Parse Failed** | Format log RouterOS Mikrotik berbeda dengan versi standar regex. | Catat log mentah dari Mikrotik, lalu sesuaikan regex di `msda/infrastructure/log-parser/vector.toml`. |
| Vector error **Connection Refused** ke n8n | n8n belum dinyalakan (namun console debug Vector tetap berjalan). | Jalankan n8n via `docker compose up -d`. |
