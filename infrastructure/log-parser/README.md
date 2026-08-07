# SATA — Guide Integration (Direct Syslog & Vector)

Integrasi komponen infrastruktur Mikrotik dan Log Parser ke proyek SATA-AI.

## Arsitektur Ringan (Direct Syslog to Vector)

```
[ Mikrotik AP ]
       │ (UDP Port 514 Syslog)
       ▼
┌──────────────────────────────────────────────┐
│  Vector Container (Log Receiver & Parser)    │
└──────────────────────┬───────────────────────┘
                       │ (HTTP POST JSON Batch)
                       ▼
┌──────────────────────────────────────────────┐
│  n8n Webhook Container                       │
└──────────────────────────────────────────────┘
```

## Setup Step-by-Step

### 1. Konfigurasi Mikrotik
1. Buka file [`infrastructure/mikrotik/mikrotik-setup.rsc`](file:///D:/ahnaf-code/turgocloudyogya/sata-ai/infrastructure/mikrotik/mikrotik-setup.rsc).
2. Ubah variabel `:local syslogServerIP "192.168.10.10"` sesuai dengan IP Server tempat Docker berjalan.
3. Import script di Mikrotik RouterOS v7:
   ```routeros
   /import file-name=mikrotik-setup.rsc
   ```

### 2. Jalankan Stack Docker SATA-AI
1. Masuk ke folder docker:
   ```bash
   cd infrastructure/docker
   ```
2. Jalankan docker compose:
   ```bash
   docker compose up -d
   ```
3. Vector akan mendengarkan Syslog Mikrotik pada Port `514/UDP` dan secara otomatis mem-parse log DNS ke bentuk JSON terstruktur lalu mengirimkannya ke `n8n`.