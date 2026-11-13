# Changelog

All notable changes to the **Repository Scanner Engine** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-11-06 — Production Upgrade Release

### Added
- **System Design Architecture Diagrams**:
  - Automated component map and data flow discovery extracting frontends, backends, entry points, routers, and third-party services.
  - Multi-provider resilient LLM enrichment with automatic Groq -> OpenRouter fallback and deterministic offline AST defaults.
  - Interactive diagram canvas with Overview and Detailed views, flow tracing, and multi-format export (SVG, PNG, JSON, Mermaid).
  - Endpoints: `POST /api/system-design/generate` and `GET /api/system-design`.
- **Multi-Language AST Parsing Engine**:
  - First-class native parsers for **Java** (`JavaParser`), **Go** (`GoParser`), **Rust** (`RustParser`), **C/C++** (`CppParser`), and **C#** (`CSharpParser`).
  - AST entity extraction for classes, interfaces, records, methods, structs, functions, trait implementations, receiver methods, and language-specific imports/includes.
  - Full registration in `ParserService` with automatic file extension routing (`.java`, `.go`, `.rs`, `.c`, `.cpp`, `.h`, `.hpp`, `.cs`).
- **Change Impact Analysis Engine (Phase 6)**:
  - Deep dependency graph traversal calculating the exact blast radius of source file/symbol changes.
  - Differentiates direct dependents, indirect dependents, function callers, callees, API consumers, and shared classes.
  - Automatically identifies affected test suites and generates 1-click executable test commands (`pytest <tests>`).
  - Computes explainable, signal-driven risk scores (0–100) and discrete risk levels (`Critical`, `High`, `Medium`, `Low`).
  - Markdown report export endpoint: `POST /api/impact/export?format=markdown`.
  - Frontend Change Impact Studio (`/impact` and `/app/repositories/:repositoryId/impact`) with risk score progress meters, tabbed impact inspections, and report download.
- **Automated AI & Deterministic Code Review (Phase 7)**:
  - Unified Git diff analyzer capable of processing working tree diffs or pasted patch files.
  - Deterministic static rules detecting SQL injection, command/shell execution, hardcoded tokens/passwords, weak cryptography (MD5/SHA1), blocking sleep in async routines, bare except clauses, and leftover debug statements.
  - Test coverage gap detector alerting when source code changes lack accompanying test modifications.
  - Optional AI-assisted reasoning evaluating race conditions, edge cases, and API regressions via configured LLM providers.
  - Frontend Code Review Dashboard (`/review` and `/app/repositories/:repositoryId/review`) featuring severity metrics, category filters, code evidence snippets, and actionable fixes.
- **Historical Repository Health Analytics & Snapshots (Phase 8)**:
  - Chronological health score tracking via `HealthHistoryService` (`GET /api/health-score/history`).
  - Scan-over-scan comparison engine (`GET /api/health-score/compare`) computing score deltas, technical debt minutes saved/added, letter grade changes, resolved vs. new findings, and degrading vs. improving modules.
- **Scalable Asynchronous Scan Worker (Phase 4)**:
  - Robust `ScanJobManager` background worker with concurrency control, repository deduplication (prevents multiple scans of the same repository), progress tracking, and cooperative cancellation (`POST /api/scans/{scan_id}/cancel`).
  - RESTful scan job lifecycle endpoints (`POST /api/scans`, `GET /api/scans`, `GET /api/scans/{scan_id}`, `GET /api/scans/{scan_id}/status`, `GET /api/scans/{scan_id}/events`).
  - Real-time Server-Sent Events (SSE) streaming progress and completion events (`event: progress`, `event: done`).
- **Grounded Codebase Citations & Context Budgeting (Phase 5)**:
  - Enriched chunk metadata capturing repository ID, symbol name, start/end line range, and relationship networks (bases, methods, callers, imports).
  - Grounded citation verification distinguishing directly verified citations (`verified_direct`) from inferred references (`inferred_relationship`).
- **Standardized Cloud Health Probes (Phase 3)**:
  - `/health/live`, `/health/ready`, and `/health` monitoring database connectivity, embedding cache directory, storage availability, configured LLM providers (without credential leakage), and scan worker readiness.

### Changed
- **Database Startup & Lifecycle**: Fixed fail-open startup bug. If `DATABASE_ENABLED=true` and database initialization fails, the server fails closed with a fatal startup error rather than silently degrading.
- **Session Cleanup**: Explicit `session.close()` in `database.py` preventing leaked SQLAlchemy connection handles.
- **Docker Compose Security**: Bound PostgreSQL container port strictly to `127.0.0.1:${POSTGRES_PORT:-5432}:5432` to eliminate unintended external network exposure.
- **Secret Hardening**: Generated high-entropy 64-character default JWT secret for local development; configured `_INSECURE_SECRETS` blacklist to forbid insecure secrets in staging/production environments.

### Removed
- **Unmaintained Authentication Dependencies**: Completely excised deprecated `python-jose[cryptography]` in favor of audited `PyJWT` with Argon2id password hashing.

---

## [2.0.0] - Prior Release
- Initial release of Repository Scanner Engine with semantic search, AST indexing, health scoring, and Electron desktop integration.
