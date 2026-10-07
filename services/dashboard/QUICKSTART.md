# 🚀 Quick Start - Lab Configuration System

## Apa yang Berubah?

Dashboard SATA sekarang **100% fleksibel**:

✅ **Nama lab bebas** - tidak harus "Lab 1, 2, 3"  
✅ **IP mapping manual** - tentukan sendiri IP mana yang jadi PC-01, PC-02, dst  
✅ **Tambah/hapus lab** - langsung dari UI tanpa coding  
✅ **Responsif** - bisa diakses dari desktop dan mobile  

## Setup (Pertama Kali)

### Option 1: Seed Data Default

Jika ingin setup cepat dengan 3 lab default:

```bash
cd /home/turgocloud/sata-ai-prod/sata-ai/services/dashboard

# Install dependencies (jika belum)
npm install

# Seed lab configs
npm run seed:labs
```

Ini akan membuat:
- **Lab Komputer 1** dengan 36 PC (192.168.10.10 - 192.168.10.45)
- **Lab Komputer 2** dengan 36 PC (192.168.20.10 - 192.168.20.45)
- **Lab Komputer 3** dengan 36 PC (192.168.30.10 - 192.168.30.45)

### Option 2: Mulai dari Nol

Langsung buka `/settings` di browser dan klik **"+ Tambah Lab"**!

## Penggunaan Harian

### 1. Monitoring Lab

Buka halaman utama atau `/labs/all` untuk melihat:
- Tab untuk setiap lab yang aktif
- Status PC (aktif/tidak aktif)
- Domain terakhir yang diakses

### 2. Mengelola Lab

Buka `/settings`:

**Tab "Kelola Lab"**:
- Tambah lab baru
- Edit nama lab
- Nonaktifkan/aktifkan lab
- Hapus lab

**Tab "Mapping IP"**:
1. Pilih lab dari dropdown
2. Lihat IP yang tersedia (dari logs 24 jam terakhir)
3. Klik "Map ke Lab" untuk mapping IP ke lab tersebut
4. IP akan otomatis diberi label PC-01, PC-02, dst

### 3. Mapping IP Baru

Ketika ada komputer baru yang terdeteksi:

1. Buka **Settings** > Tab **"Mapping IP"**
2. IP baru akan muncul di list **"IP yang Tersedia"**
3. Pilih lab tujuan
4. Klik **"Map ke Lab"** pada IP tersebut

### 4. Rename Lab

Jika ingin ganti nama "Lab Komputer 1" jadi "Lab Multimedia":

1. Buka **Settings** > Tab **"Kelola Lab"**
2. Cari card "Lab Komputer 1"
3. Klik tombol **"Edit"**
4. Ubah nama jadi "Lab Multimedia"
5. Klik **"Simpan"**

Tab di dashboard akan otomatis update!

## Mobile Access

Dashboard bisa diakses dari smartphone:

📱 **Sidebar**: Tekan hamburger menu (☰) di kiri atas  
📱 **Settings**: Scroll horizontal/vertikal sesuai layar  
📱 **Mapping**: Klik "Map ke Lab" langsung dari mobile  

## Troubleshooting

### Lab tidak muncul di dashboard

Cek:
- ✅ Lab status **Aktif** (hijau) di Settings
- ✅ Ada IP yang sudah dimapping ke lab tersebut
- ✅ Refresh halaman

### IP tidak muncul di "IP yang Tersedia"

Cek:
- ✅ IP tersebut ada di logs `dns_events` (MongoDB)
- ✅ Aktif dalam 24 jam terakhir
- ✅ Belum dimapping ke lab lain

### Error saat seed

Pastikan:
- ✅ MongoDB running
- ✅ Environment variable `MONGODB_URI` sudah set
- ✅ Collection `lab_configs` dan `ip_mappings` kosong

Jika sudah ada data, hapus dulu:

```bash
mongosh sata --eval "db.lab_configs.drop(); db.ip_mappings.drop();"
npm run seed:labs
```

## API Reference

### Get Available IPs

```bash
curl http://localhost:3000/api/available-ips?hours=24
```

### Create Lab

```bash
curl -X POST http://localhost:3000/api/lab-config \
  -H "Content-Type: application/json" \
  -d '{"name":"Lab Baru","ap_ip":"192.168.40.1"}'
```

### Map IP to Lab

```bash
curl -X POST http://localhost:3000/api/ip-mappings \
  -H "Content-Type: application/json" \
  -d '{
    "lab_id":"xxx",
    "client_ip":"192.168.10.15",
    "seat":5,
    "label":"PC-05"
  }'
```

## Next Steps

1. ✅ Seed data atau buat lab manual
2. ✅ Mapping IP dari logs
3. ✅ Buka dashboard untuk monitoring
4. 📚 Baca [LAB_CONFIG_GUIDE.md](./LAB_CONFIG_GUIDE.md) untuk detail lengkap

---

**Happy Monitoring! 🎉**
