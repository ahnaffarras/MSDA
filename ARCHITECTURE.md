# ARCHITECTURE.md

## Project Study Case

MikroTik Smart DNS Analytics (MSDA) is a network intelligence platform designed to transform MikroTik DNS traffic data into actionable insights. The core challenge is to move from raw network logs to an automated analytics workflow that can support both operational monitoring and business-facing reporting.

The system is built around a simple but powerful idea: collect DNS-related events from access points, transform them into structured data, analyze them with AI, and deliver results to stakeholders through Slack and a web dashboard.

## Business Context

The project aims to solve the following needs:
- understand which domains are being accessed per access point
- identify the number of connected or active clients per AP
- detect suspicious or high-risk traffic patterns
- provide automated reporting without manual intervention
- create a foundation for a production-grade monitoring product

## Product Vision

MSDA should evolve from an initial technical prototype into an MVP product that can:
- ingest traffic events continuously
- store and analyze data over time
- present dashboards and summaries for decision makers
- trigger alerts for anomalies or security concerns

## System Flow

### 1. Data Collection

- MikroTik access points generate DNS-related events
- DNS routing and logging are configured so traffic is captured
- Logs are sent to a central logging system

### 2. Data Parsing

- Vector processes incoming logs
- Raw entries are transformed into structured JSON
- Key fields include timestamp, client IP, access point, domain, and event metadata

### 3. Data Ingestion

- n8n receives parsed payloads through a webhook
- The workflow validates and forwards the data to downstream services

### 4. AI Processing

- AI is used to summarize activity patterns
- The system can detect top domains, client counts, and trend changes
- Future versions can compare live data with historical data

### 5. Delivery and Reporting

- Results are pushed to Slack for notifications
- A dashboard visualizes metrics and trends
- Alerts can be triggered for suspicious activity or anomalies

## Technologies

### Core Infrastructure

- Docker / Docker Compose
- MongoDB
- n8n
- Vector

### Application Layer

- Next.js
- TypeScript
- Tailwind CSS
- Gravity UI Icons
- Geist font

### Automation and Intelligence

- Webhook-based ingestion
- AI enrichment through external AI services
- Slack notification integration

## Functional Modules

### 1. Infrastructure Module

Responsible for deployment and runtime orchestration.
- Docker Compose orchestrates MongoDB, Redis, n8n, Vector, the Go backend and the dashboard
- Only the dashboard (3000), n8n (5678) and Vector syslog (514) are published to the host; MongoDB, Redis and the backend stay on the internal Docker network
- Services expose health checks and wait for their dependencies to be healthy
- Environment configuration is separated from application logic

### 2. Log Parsing Module

Responsible for transforming raw logs into structured JSON.
- Vector receives log input
- Parsing rules extract relevant attributes
- Events are normalized for downstream processing

### 3. Workflow Automation Module

Responsible for orchestrating the data movement and AI workflow.
- n8n receives webhook payloads
- Jobs are routed through processing branches
- Reports and alerts are emitted to external systems

### 4. Analytics Module

Responsible for interpretation and insight generation.
- AI generates summaries of client activity
- Trend and anomaly analysis can be added later
- Output should be suitable for both Slack and dashboards

### 5. Dashboard Module

Responsible for presenting the data to users.
- Next.js frontend renders charts and summary cards
- The dashboard is designed to support monitoring and executive reporting

### 6. Security and Access Module

Responsible for who can see and change what.
- Users sign in to the dashboard with a session cookie (`dashboard_users`, `dashboard_sessions`); roles are `admin` (read and write) and `viewer` (read only)
- The Go backend has no login of its own. The dashboard proxy (`/api-proxy/*`) verifies the session, blocks write methods for viewers, and forwards the call with a secret `X-Internal-Token` (`MSDA_INTERNAL_TOKEN`); direct calls to the backend without it are rejected
- n8n calls the backend webhook with `X-MSDA-Token` (`MSDA_WEBHOOK_TOKEN`); both tokens fail closed when unset
- With `APP_ENV=production` the backend refuses to start if a token or the MongoDB password is empty, too short, or still a placeholder
- Every sensitive dashboard action is written to `audit_logs` (sign-ins, user and blocklist changes, settings, cleanup, notification status). Secrets are never stored in the log. Retention defaults to 180 days and is managed on the Storage page

### 7. Alerting Module

- Notifications carry `severity` (`info`/`warning`/`critical`) and a handling `status` (`new` → `acknowledged` → `resolved`, with notes)
- The dashboard polls `unread-count` every 20 seconds (paused while the tab is hidden) to drive the sidebar badge, toasts and automatic list refresh
- Channel routing (Slack/Telegram), minimum severity, batching and quiet hours live in `notification_settings`; n8n reads them, and bot tokens stay in n8n only

### 8. DNS Enforcement Module (optional)

- Off by default (`MSDA_ENFORCEMENT_ENABLED=false`); AdGuard Home runs only under the Compose profile `enforcement`
- Each blocklist entry has a mode: **Monitor** (alert only, the original behaviour) or **Block DNS** (blocked by AdGuard and still alerted)
- MongoDB `dns_blacklist` is the single source of truth; the Go backend generates the full AdGuard rule set (`||domain^`) idempotently, on every blocklist change, on a timer and at startup. n8n never calls AdGuard; it only reads `GET /api/v1/webhooks/adguard-status`
- MikroTik stays the clients' first resolver (logging pipeline unchanged) and AdGuard is its only upstream, so per-client attribution always comes from MikroTik logs
- Details, limits (DNS cache, DoH/DoT bypass, no block page) and rollback: [docs/adguard.md](docs/adguard.md)

## Data Model Direction

The system should eventually support the following data categories:
- raw log events
- parsed event records
- AI summaries
- alert records
- trend and historical analytics results

A practical initial structure can include:
- timestamp
- client_ip
- access_point_name
- domain
- source
- analysis_result
- alert_level

## Analytical Goals

The analytical layer should support:
- unique device counts per AP
- top domains per AP
- daily and hourly traffic trends
- historical comparisons
- anomaly detection for abnormal access patterns
- security flagging for suspicious domains

## MVP Scope

The first MVP should include:
- DNS log ingestion path from MikroTik
- parser and JSON transformation
- n8n webhook-driven workflow
- AI-generated summaries
- Slack report delivery
- basic dashboard views

## Product Evolution Path

After MVP, the project can evolve into a more mature product by adding:
- persistent long-term storage and historical analytics
- improved anomaly detection and alerting
- richer dashboards and filters
- role-based access and authentication
- integrations with additional notification and monitoring systems

## Development Guidelines

- Keep the architecture modular and easy to extend
- Favor simple integrations over overly complex implementations
- Maintain clear separation between ingestion, processing, analytics, and presentation
- Update documentation whenever the workflow or architecture changes
- Respect security and privacy expectations when handling network data
