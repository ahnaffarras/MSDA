# Performa dan index

## Prinsip
- Semua grafik dan ringkasan diagregasi **di MongoDB** (`$group`), bukan di browser. Browser hanya menerima ≤ 400 titik grafik dan 168 sel heatmap.
- Setiap daftar berpaginasi atau dibatasi `limit`: audit log (50/halaman), klien (50), label (50), notifikasi (maks. 100), event (maks. 10.000, dipakai DNS Intelligence), client-access (maks. 1.000), `available-ips` (maks. 1.000 dan 720 jam).
- Tabel konfigurasi kecil (groups, nodes, lab-config, ip-mappings, users) memang dibaca utuh karena jumlahnya terbatas.

## Index yang dibuat otomatis
Dashboard membuatnya di latar belakang saat start (`src/lib/data-indexes.ts`); gagal membuat index tidak menghentikan dashboard.

| Koleksi | Index | Dipakai oleh |
|---|---|---|
| `ip_access_dns` | `timestamp ↓` | Overview, tren, live feed, laporan mingguan |
| | `client_ip, timestamp ↓` | detail klien, daftar klien |
| | `domain, timestamp ↓` | detail domain |
| | `ap_info.ip, timestamp ↓` dan `ap_ip, timestamp ↓` (data lama) | jaringan/AP |
| `dns_blacklist`, `dns_allowlist`, `dns_info` | `domain` | cek blokir, detail domain |
| `dns_ai_reports`, `dns_daily_stats` | `date` | laporan harian |
| `audit_logs` | `ts ↓`, `actor_username, ts ↓`, `action, ts ↓` | halaman Audit |
| `notifications` | lihat `data-struktur/STRUCTURE.md` | halaman Notifications (dibuat backend) |
| `client_devices` | `ip`, `mac` (sparse), `updated_at ↓` | label klien |

Pada koleksi yang sangat besar, pembuatan index pertama kali bisa memakan waktu beberapa menit dan menambah beban disk; itu terjadi sekali.

## Catatan tipe `timestamp`
Data lama menyimpan `timestamp` sebagai string ISO, data baru sebagai `Date`. Filter waktu (`lib/query.ts`) memakai `$or` untuk kedua tipe, dan tiap cabang memakai index yang sama. Bila seluruh data sudah `Date`, bagian string bisa dihapus agar kueri lebih sederhana.

## Memeriksa kueri dengan explain()
```bash
cd services/dashboard
MONGODB_URI="mongodb://msda:PASSWORD@127.0.0.1:27017/msda?authSource=admin" MONGODB_DB=msda \
  node scripts/explain-queries.mjs
```
(Untuk menjangkau MongoDB dari host, jalankan stack dengan `docker-compose.dev.yml`.) Skrip menjalankan `explain("executionStats")` untuk kueri utama dan mencetak apakah memakai `IXSCAN` atau `COLLSCAN`, jumlah dokumen yang diperiksa, dan waktunya. **Jika ada `COLLSCAN`**: periksa dulu apakah index sudah selesai dibuat (lihat log dashboard, baris `[indexes]`).
