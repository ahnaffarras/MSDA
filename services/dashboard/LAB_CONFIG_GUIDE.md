# Lab Configuration Guide

Dashboard SATA sekarang mendukung **konfigurasi lab yang fleksibel**. Anda dapat:

- ✨ Membuat lab baru dengan nama custom
- 🔄 Mengubah nama lab yang sudah ada
- 📍 Mapping IP address dari logs ke lab tertentu secara manual
- 🗑️ Menghapus lab dan mapping IP
- 📱 Akses dari desktop maupun mobile

## 🚀 Setup Awal

### 1. Seed Data Awal (Opsional)

Jika Anda ingin menggunakan konfigurasi default (3 lab dengan 36 PC masing-masing):

```bash
cd /home/turgocloud/sata-ai-prod/sata-ai/services/dashboard
npx tsx scripts/seed-labs.ts
```

Ini akan membuat:
- Lab Komputer 1 (192.168.10.1) dengan PC-01 hingga PC-36
- Lab Komputer 2 (192.168.20.1) dengan PC-01 hingga PC-36  
- Lab Komputer 3 (192.168.30.1) dengan PC-01 hingga PC-36

### 2. Atau Mulai dari Nol

Langsung ke `/settings` di browser dan buat lab pertama Anda!

## 📋 Cara Menggunakan

### Mengelola Lab

1. Buka **Settings** (`/settings`) dari sidebar
2. Di tab **"Kelola Lab"**:
   - Klik **"+ Tambah Lab"** untuk membuat lab baru
   - Isi **Nama Lab** (contoh: "Lab Multimedia", "Lab Desain Grafis")
   - Isi **AP IP Address** (contoh: "192.168.40.1")
   - Klik **"Tambah"**

3. Edit lab yang sudah ada:
   - Klik tombol **"Edit"** pada card lab
   - Ubah nama atau IP
   - Klik **"Simpan"**

4. Hapus lab:
   - Klik tombol **"Hapus"** pada card lab
   - Konfirmasi penghapusan (semua mapping IP akan ikut terhapus)

### Mapping IP ke Lab

#### Cara Manual (Rekomendasi)

1. Buka tab **"Mapping IP"** di halaman Settings
2. **Pilih lab** dari dropdown
3. Lihat daftar **"IP yang Tersedia"** - ini adalah IP yang terdeteksi dari logs dalam 24 jam terakhir
4. Klik **"Map ke Lab"** pada IP yang ingin Anda petakan
5. IP akan otomatis diberi label PC-01, PC-02, dst.

#### Melihat dan Menghapus Mapping

Setelah memilih lab di dropdown, scroll ke bawah untuk melihat **"IP Terpetakan"**. 
Klik **"Hapus"** untuk menghapus mapping IP tertentu.

## 🎯 Keunggulan Sistem Baru

### Fleksibilitas Penuh

- **Nama lab bebas**: Tidak lagi harus "Lab 1, 2, 3"
- **IP tidak fixed**: IP 192.168.10.11 bisa jadi PC-05 di Lab 1, atau PC-12 di Lab 2
- **Scaling mudah**: Bisa bikin Lab 4, 5, 6 tanpa coding
- **Seat numbering otomatis**: Sistem otomatis assign nomor seat berurutan

### Smart IP Detection

Sistem mendeteksi IP yang aktif dari logs DNS dan menampilkan:
- **Client IP**: IP address perangkat
- **AP Name**: Access point mana yang digunakan
- **Query count**: Berapa banyak DNS query dalam 24 jam terakhir
- **Last seen**: Kapan terakhir kali IP ini aktif
- **Status**: Sudah dipetakan atau belum

### Responsive Design

Dashboard bisa diakses dari:
- 💻 **Desktop**: Full sidebar, grid view
- 📱 **Mobile**: Hamburger menu, scrollable cards
- 🖥️ **Tablet**: Adaptive layout

## 🔧 API Endpoints

Sistem menyediakan REST API untuk integrasi:

### Lab Config

```bash
# Get all labs
GET /api/lab-config

# Create new lab
POST /api/lab-config
Body: { "name": "Lab Baru", "ap_ip": "192.168.50.1" }

# Update lab
PUT /api/lab-config/[id]
Body: { "name": "Lab Updated", "is_active": false }

# Delete lab
DELETE /api/lab-config/[id]
```

### IP Mappings

```bash
# Get all mappings (or filter by lab_id)
GET /api/ip-mappings?lab_id=xxx

# Create mapping
POST /api/ip-mappings
Body: { 
  "lab_id": "xxx", 
  "client_ip": "192.168.10.15", 
  "seat": 5, 
  "label": "PC-05" 
}

# Delete mappings
DELETE /api/ip-mappings
Body: { "ids": ["id1", "id2"] }
```

### Available IPs

```bash
# Get IPs from logs (last 24 hours)
GET /api/available-ips?hours=24&include_mapped=false
```

## 📊 Collection Schema

### `lab_configs`

```typescript
{
  _id: ObjectId,
  name: string,           // "Lab Komputer 1"
  ap_ip: string,          // "192.168.10.1"
  order: number,          // Display order in tabs
  is_active: boolean,     // Show/hide this lab
  created_at: string,     // ISO 8601
  updated_at: string
}
```

### `ip_mappings`

```typescript
{
  _id: ObjectId,
  lab_id: string,         // Reference to lab_configs._id
  client_ip: string,      // "192.168.10.15"
  seat: number,           // 5
  label: string,          // "PC-05"
  created_at: string,
  updated_at: string
}
```

## 🐛 Troubleshooting

### Lab tidak muncul di dashboard

- Pastikan lab dalam status **is_active: true**
- Cek apakah ada IP mapping untuk lab tersebut
- Refresh halaman dashboard

### IP tidak muncul di "Available IPs"

- Pastikan IP tersebut ada di collection `dns_events`
- Cek timestamp - hanya IP dalam 24 jam terakhir yang ditampilkan
- Gunakan parameter `?hours=48` untuk melihat IP lebih lama

### Error "IP already mapped"

IP hanya bisa dipetakan ke satu lab. Hapus mapping yang lama dulu sebelum mapping ulang.

## 📱 Mobile Optimization

Seluruh UI sudah dioptimasi untuk mobile:

- **Sidebar**: Toggle hamburger menu
- **Cards**: Stack vertikal di mobile
- **Tables**: Horizontal scroll
- **Buttons**: Full width di mobile
- **Forms**: Touch-friendly input
- **Modals**: Responsive dialog

## 🎨 Customization

Anda bisa mengubah:

1. **Jumlah PC per lab**: Tidak ada limit, tinggal map IP sesuai kebutuhan
2. **Label format**: Bisa "PC-01", "Workstation-A", "Komputer 1", dll
3. **Default hours**: Ubah parameter `hours` di API available-ips
4. **Auto-refresh interval**: Edit `setInterval` di LabTabs.tsx (default 15 detik)

## ✅ Best Practices

1. **Seed dulu untuk testing**: Jalankan script seed untuk dapat konfigurasi default
2. **Monitor available IPs**: Rutin cek halaman Settings tab Mapping IP untuk melihat IP baru
3. **Naming convention**: Gunakan nama lab yang deskriptif (Lab Multimedia, Lab Bahasa, dll)
4. **Regular cleanup**: Hapus IP mapping yang sudah tidak aktif
5. **Backup config**: Export lab_configs dan ip_mappings sebelum perubahan besar

## 📞 Support

Untuk pertanyaan atau issue, hubungi admin sistem atau buka issue di repository.
