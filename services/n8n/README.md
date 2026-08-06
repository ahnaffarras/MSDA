# n8n Service

This folder is the starting point for SATA workflow automation.

Planned workflow stages:
- webhook ingestion from the log parser
- AI enrichment with Google AI Studio
- Slack reporting and alerting

Start the stack with:

```bash
docker-compose -f infrastructure/docker/docker-compose.yml up -d
```
