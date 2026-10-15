# MikroTik Smart DNS Analytics (MSDA)

> **Catatan Proyek:** MSDA merupakan pengembangan lanjutan dari proyek **SATA-AI (Smart AP Traffic Analyzer)**. Lihat bagian [Latar Belakang: Pengembangan dari SATA-AI](#latar-belakang-pengembangan-dari-sata-ai) di bawah.

MikroTik Smart DNS Analytics (MSDA) is an end-to-end monitoring and analytics platform for MikroTik-based network environments. It is designed to collect DNS-related traffic information, transform it into structured data, enrich it with AI, and present actionable insights through Slack and a web dashboard.

## Latar Belakang: Pengembangan dari SATA-AI

MSDA (MikroTik Smart DNS Analytics) adalah pengembangan dan evolusi lanjutan dari proyek **SATA-AI (Smart AP Traffic Analyzer)**.

- **SATA-AI** berfokus pada analisis traffic access point (AP) secara umum.
- **MSDA** mempersempit dan memperdalam fokus tersebut pada **analisis traffic DNS berbasis router MikroTik**, dengan pipeline pengolahan data terstruktur, pengayaan konteks keamanan berbasis AI, serta pemantauan interaktif melalui dashboard web dan notifikasi Slack.

Arsitektur dasar (MikroTik → Vector → n8n → Redis/MongoDB → Dashboard) dilanjutkan dari SATA-AI, sementara penamaan, variabel environment, header webhook (`X-MSDA-Token`), dan komponen layanan kini seluruhnya menggunakan prefix **MSDA**. Catatan: nama lama `SATA_*` tidak lagi didukung, jadi gunakan `MSDA_*` pada file `.env`.

## What This Application Does

MSDA helps network administrators and IT teams understand how clients are using the network by analyzing DNS traffic from access points. The platform can be used to:
- capture browsing-related DNS events from MikroTik
- normalize raw log data into JSON
- summarize activity by access point and client
- generate daily or real-time reports
- monitor unusual or suspicious behavior
- visualize traffic trends through a dashboard

## Project Goals

The system is being built in two major phases:
- Phase 1 focuses on the core pipeline: log collection, parsing, workflow automation, and Slack reporting
- Phase 2 expands the platform with storage, anomaly detection, AI trend analysis, and a full dashboard experience

## Architecture Overview

The current repository includes the initial foundation for:
- Docker-based deployment for core services
- MongoDB for persistent storage
- n8n for workflow orchestration
- Vector as the log parsing engine
- a Next.js dashboard for visualization

## Installation

MSDA runs entirely in Docker. You do not need to run `npm run dev` to use it; that is only for dashboard development (see below).

### Prerequisites
- Docker Desktop or Docker Engine with Docker Compose v2
- `openssl` (or any tool that makes random strings) to generate secrets
- WSL if you are using Docker from Windows

### 1. Clone the repository
```bash
git clone <repository-url>
cd msda
```

### 2. Create the environment file and fill in the secrets
```bash
cd infrastructure/docker
cp .env.example .env
```
Open `.env` and set the required values. Generate each secret with:
```bash
openssl rand -hex 32   # MSDA_WEBHOOK_TOKEN and MSDA_INTERNAL_TOKEN (two different values)
openssl rand -hex 16   # MONGO_ROOT_PASSWORD and N8N_ENCRYPTION_KEY
```
There are no default secrets any more: `docker compose up` stops with a clear message if a required value is empty. With `APP_ENV=production` (set by the compose file) the backend also refuses to start when a token or the MongoDB password is empty, too short, or still a placeholder.

> If you already have a running installation: the MongoDB password only applies when the data volume is first created, and `N8N_ENCRYPTION_KEY` must stay the same as before or n8n can no longer read its saved credentials.

### 3. Start everything
```bash
docker compose up -d --build
docker compose ps        # every service should become "healthy"
```

Then open:
- http://localhost:3000 for the dashboard (the first administrator password is printed once in `docker logs msda-dashboard` unless you set `MSDA_BOOTSTRAP_ADMIN_PASSWORD`)
- http://localhost:5678 for n8n (put it behind a reverse proxy with authentication before exposing it)

Only these ports are published to the host: `3000` (dashboard), `5678` (n8n), `514` (syslog from MikroTik) and `127.0.0.1:8686` (Vector API). MongoDB, Redis and the Go backend are reachable only inside the Docker network.

### Local development
To reach MongoDB, Redis and the backend from your machine (bound to `127.0.0.1` only):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
cd ../../services/dashboard
npm ci
npm run dev
```
Checks used by CI: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (dashboard) and `go vet ./... && go test ./... && go build ./...` (backend).

## Pages at a Glance

| Page | What it is for |
|---|---|
| **Dashboard** | Today's picture: queries, flagged traffic, trends and the busiest hours. Choose *Today / 24h / 7d / 30d* or a custom date range; the choice is kept in the URL so you can share it. |
| **Live Feed** | DNS requests as they arrive, with pause and filters. |
| **DNS Intelligence**, **Domain Info** | Browse domains and categories. Click a domain for its own page: who asked for it, when, from which access point, and whether it is blocked. |
| **Clients** | Everyone seen on the network and the labels you gave them (import a CSV to label many at once). Click a client for its timeline, top domains and access points. |
| **Blocklist** | Block domains, optionally *until a date*, import/export CSV, and keep an **Allowlist** that always wins over the blocklist. |
| **Notifications** | Alerts with severity and a *new → acknowledged → resolved* workflow; unread count in the sidebar. Notification settings (Slack/Telegram routing, quiet hours) are under *Notifications → Settings*. |
| **Reports** | Daily AI reports (export to CSV) and a weekly report built from real data; *Print / PDF* saves any report as a PDF. |
| **Users & Access**, **Audit Log** | Administrators only: accounts, client privacy for viewers, and a trail of who did what. |

Backups run automatically; see [docs/backup-restore.md](docs/backup-restore.md). Performance notes and indexes: [docs/performance.md](docs/performance.md).

## How to Use It

1. Configure MikroTik DNS logging and remote logging
2. Send parsed logs into the workflow pipeline
3. Use n8n to process and enrich data with AI
4. Review the generated summaries in Slack or the dashboard
5. Extend the workflow for anomaly alerts or additional analytics

## Development Workflow

The repository is organized as follows:
- [infrastructure/docker](infrastructure/docker) contains deployment configuration
- [infrastructure/log-parser](infrastructure/log-parser) contains Vector configuration
- [infrastructure/mikrotik](infrastructure/mikrotik) contains MikroTik-related notes
- [services/n8n](services/n8n) is the workflow automation area
- [services/dashboard](services/dashboard) contains the web dashboard
- [services/msda-backend](services/msda-backend) contains the Go API used by the dashboard (not exposed to the host)
- [data-struktur](data-struktur) documents collections, fields and the webhook contract

## Contributing

Contributions are welcome. If you want to contribute:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request with a clear description

## Roadmap

Planned improvements include:
- stronger MikroTik integration
- richer AI prompts and summaries
- long-term analytics and historical comparisons
- anomaly detection and automated incident alerts
- more interactive dashboard charts and filters

## License

This project is currently under active development and may be updated frequently.   


