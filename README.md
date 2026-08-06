# Smart AP Traffic Analyzer (SATA)

Smart AP Traffic Analyzer (SATA) is an end-to-end monitoring and analytics platform for MikroTik-based network environments. It is designed to collect DNS-related traffic information, transform it into structured data, enrich it with AI, and present actionable insights through Slack and a web dashboard.

## What This Application Does

SATA helps network administrators and IT teams understand how clients are using the network by analyzing DNS traffic from access points. The platform can be used to:
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
- MongoDB f
or persistent storage
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
cd sata-ai
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
