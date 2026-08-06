# AGENT.md

## Purpose

This file defines the working rules for AI assistants contributing to the SATA project. It is the operational guide for how the project should be implemented, documented, and evolved from initial scaffolding to MVP and beyond.

## Core Principles

1. Follow the project flow defined in ARCHITECTURE.md before making changes.
2. Preserve the intended system architecture and avoid introducing unrelated patterns.
3. Prefer incremental, reversible changes over large risky rewrites.
4. Use backup practices before significant edits:
   - keep a copy of the original content when making major changes
   - avoid destructive replacements without review
   - preserve working files and config integrity
5. Do not access or modify system files outside the repository unless explicitly required and safe.
6. Do not expose secrets, credentials, tokens, or private infrastructure details in code or documentation.

## Working Rules

- Always inspect the existing repository structure before editing.
- Respect the separation of concerns:
  - infrastructure for deployment and runtime setup
  - services for application logic and workflow automation
  - docs for architectural and project documentation
- Keep changes aligned with the SATA roadmap: foundation, automation, analytics, and monitoring.
- When implementing features, prefer a simple and understandable approach that can scale into MVP and production.
- If a change affects multiple layers, update the relevant documentation and configuration together.

## File Handling Rules

- Do not modify system-level files outside the project workspace without clear necessity.
- Avoid unnecessary file deletions or destructive operations.
- Prefer editing existing files and preserving context.
- Use backups or version-safe edits when changing important configuration files.

## Development Flow

1. Understand the request and the current repository state.
2. Review ARCHITECTURE.md for the intended system behavior and constraints.
3. Implement the smallest relevant change that fits the architecture.
4. Verify the result with available checks such as Docker Compose validation or project builds.
5. Update documentation when behavior or structure changes.

## Priority Order

1. Maintain repository consistency
2. Preserve architecture integrity
3. Keep implementation safe and reversible
4. Ensure the project remains aligned with MVP goals

## Important Note

All core technical guidance, product context, system flow, data model decisions, and implementation direction for this project must be referenced from ARCHITECTURE.md.
