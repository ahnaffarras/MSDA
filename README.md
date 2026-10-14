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

### Prerequisites
- Docker Desktop or Docker Engine
- Docker Compose
- Node.js 18+ and npm
- WSL if you are using Docker from Windows

### 1. Clone the repository
```bash
git clone <repository-url>
cd msda
```

### 2. Prepare environment files
Copy the example environment file if needed:
```bash
cp infrastructure/docker/.env.example infrastructure/docker/.env
```

### 3. Start the infrastructure services
```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

### 4. Start the dashboard
```bash
cd services/dashboard
npm install
npm run dev
```

Then open:
- http://localhost:5678 for n8n
- http://localhost:3000 for the dashboard

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


