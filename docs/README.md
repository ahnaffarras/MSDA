# SATA Project Documentation

This document outlines the architecture and development roadmap for the Smart AP Traffic Analyzer (SATA) project.

## Overview

SATA is a network intelligence platform that collects DNS activity from MikroTik access points, transforms it into structured JSON, runs AI-based analysis, and pushes actionable insights to Slack and dashboard interfaces.

## Phase 1: Core Pipeline Objectives

The initial phase is focused on creating a reliable data pipeline:

- route client DNS requests through MikroTik
- capture DNS events through dedicated logging rules
- forward logs to a local logging service
- parse raw logs into structured JSON objects
- ingest the JSON into n8n through a webhook
- use AI to summarize network activity per access point
- send daily summaries to Slack

## Phase 2: Advanced Analytics and Automation Objectives

The second phase expands the solution into a production-grade observability platform:

- containerize the non-MikroTik services using Docker
- store raw events and AI outputs in MongoDB
- compare current results with historical trends
- detect anomalies and suspicious domains in real time
- trigger immediate Slack alerts for critical incidents
- expose the collected data through a Next.js dashboard with charts and metrics

## Repository Structure

- infrastructure/docker: Docker Compose and runtime environment files
- infrastructure/log-parser: Vector configuration for log parsing
- infrastructure/mikrotik: MikroTik-related notes and implementation guidance
- services/n8n: workflow automation entry points
- services/dashboard: Next.js dashboard application

## Current Implementation Status

The repository currently contains the initial scaffolding for:
- Docker Compose-based service setup
- MongoDB persistence
- n8n orchestration foundation
- Vector log parser configuration
- a dashboard application for future analytics visualization

## Expected Deliverables

By completion, SATA should provide:
- automated DNS log ingestion
- AI-based analytics summaries
- scheduled Slack reporting
- anomaly and security alerting
- persistent storage and visual dashboard reporting
