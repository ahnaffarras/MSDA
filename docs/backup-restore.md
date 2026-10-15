# Backup dan restore

MSDA membuat backup MongoDB otomatis lewat service `backup` di `docker-compose.yml`.

## Yang dicadangkan

| Dicadangkan | Tidak dicadangkan |
|---|---|
| Seluruh MongoDB: log DNS, blocklist/allowlist, laporan, notifikasi, **akun dashboard, sesi, audit log**, label klien, pengaturan | Data n8n (workflow dan kredensial, ada di volume `n8n-data`), volume Redis (hanya cache/dedup), file `.env` |

> File `.env` berisi secret. Simpan salinannya sendiri di tempat yang aman (mis. password manager). Tanpa `N8N_ENCRYPTION_KEY` yang sama, kredensial n8n hasil backup tidak bisa dibaca.

## Cara kerja

- Satu `mongodump` (terkompresi, satu file) setiap `BACKUP_INTERVAL_HOURS` jam (default 24), pertama kali saat service start.
- File bernama `msda-YYYYMMDD-HHMMSS.archive.gz` di volume `backup-data`.
- Backup lebih tua dari `BACKUP_RETENTION_DAYS` hari (default 14) dihapus, **hanya setelah backup baru berhasil**. Backup yang gagal atau rusak ditolak dan tidak pernah menghapus salinan lama.
- Status kesehatan: `docker compose ps` menampilkan `backup` sebagai `healthy` selama backup sukses terakhir masih baru.

```bash
docker compose logs backup                          # riwayat backup
docker compose exec backup ls -lh /backups          # daftar file
docker compose exec backup /backup.sh --once        # backup sekarang juga
```

## Salin keluar dari server (sangat disarankan)

Volume `backup-data` berada di disk yang sama dengan database. Kalau disk rusak, keduanya hilang. Salin berkala ke tempat lain:

```bash
docker cp msda-backup:/backups/msda-20261015-020000.archive.gz ./
# lalu pindahkan ke storage/komputer lain (scp, rclone, dll.)
```

## Restore

> Restore memakai `--drop`: koleksi yang ada **diganti** isinya dengan isi backup. Data yang dibuat setelah backup akan hilang. Coba dulu di mesin uji, atau lakukan "uji restore" di bawah.

```bash
cd infrastructure/docker

# 1) Hentikan layanan yang menulis ke database
docker compose stop dashboard backend n8n vector

# 2) Salin file backup ke container mongo
docker cp ./msda-20261015-020000.archive.gz msda-mongo:/tmp/restore.archive.gz

# 3) Restore (ganti USER dan PASSWORD sesuai .env)
docker compose exec mongo mongorestore \
  --uri="mongodb://USER:PASSWORD@localhost:27017/?authSource=admin" \
  --archive=/tmp/restore.archive.gz --gzip --drop

# 4) Bersihkan dan nyalakan kembali
docker compose exec mongo rm /tmp/restore.archive.gz
docker compose up -d
```

Cek setelah restore: login ke dashboard, buka **Audit Log** dan **Storage & Cleanup** untuk memastikan jumlah dokumen wajar.

## Uji restore (tanpa mengganggu data aktif)

Memulihkan ke database sementara bernama `restore_test`, lalu dibuang. Lakukan minimal sebulan sekali supaya Anda tahu backup benar-benar bisa dipakai.

```bash
docker cp ./msda-20261015-020000.archive.gz msda-mongo:/tmp/restore.archive.gz
docker compose exec mongo mongorestore \
  --uri="mongodb://USER:PASSWORD@localhost:27017/?authSource=admin" \
  --archive=/tmp/restore.archive.gz --gzip \
  --nsFrom='msda.*' --nsTo='restore_test.*'

docker compose exec mongo mongo "mongodb://USER:PASSWORD@localhost:27017/restore_test?authSource=admin" \
  --quiet --eval 'db.getCollectionNames().forEach(function(c){print(c, db[c].countDocuments({}))})'

# selesai: hapus database uji
docker compose exec mongo mongo "mongodb://USER:PASSWORD@localhost:27017/restore_test?authSource=admin" \
  --quiet --eval 'db.dropDatabase()'
docker compose exec mongo rm /tmp/restore.archive.gz
```

## Backup data n8n (volume `n8n-data`)

```bash
docker run --rm -v docker_n8n-data:/data -v "$PWD":/out alpine tar czf /out/n8n-data.tgz -C /data .
```

Nama volume bisa berbeda (cek `docker volume ls`; biasanya `<nama-folder-compose>_n8n-data`).
