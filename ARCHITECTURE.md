# ARCHITECTURE.md

## Project Study Case

Smart AP Traffic Analyzer (SATA) is a network intelligence platform designed to transform MikroTik DNS traffic data into actionable insights. The core challenge is to move from raw network logs to an automated analytics workflow that can support both operational monitoring and business-facing reporting.

The system is built around a simple but powerful idea: collect DNS-related events from access points, transform them into structured data, analyze them with AI, and deliver results to stakeholders through Slack and a web dashboard.

## Business Context

The project aims to solve the following needs:
- understand which domains are being accessed per access point
- identify the number of connected or active clients per AP
- detect suspicious or high-risk traffic patterns
- provide automated reporting without manual intervention
- create a foundation for a production-grade monitoring product

## Product Vision

SATA should evolve from an initial technical prototype into an MVP product that can:
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
- Docker Compose orchestrates MongoDB, n8n, and Vector
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
