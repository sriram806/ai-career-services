# ADR 0002: Career Intelligence Foundation Architecture

## Context and Problem Statement
Week 2 transforms the AI Career OS into an intelligent profile platform by introducing the **Career Intelligence Foundation**. The platform needs to merge multiple structured and unstructured developer credentials (resumes, LinkedIn profile JSONs, and GitHub activity metadata) into a single, cohesive, high-fidelity developer profile. 
To serve future AI engines (Resume Intelligence, Career Coach, Interview Simulator, etc.), the data must be highly structured, deduplicated, and normalized, while preserving source origin metadata and meeting strict GDPR consent/privacy requirements.

## Decision Drivers
* **AI-First Design**: Downstream AI models require structured profiles to compute skill ratings, perform mock interviews, and evaluate career roadmaps.
* **Strict Privacy & GDPR Compliance**: Candidates must have full control over their data, including visibility preferences, selective source disconnections, and absolute hard deletes (Right to be Forgotten).
* **Reliability and Fault-Tolerance**: Syncing large amounts of external API data (like GitHub) shouldn't block user requests or crash during external rate-limiting.
* **Maintainability and DDD**: Separation of business logic (Application Services, Normalization Engines) from presentation (Controllers) and database details (Repositories).

## Considered Options
1. **Monolithic DB Structure**: Store all raw data in a single SQL database.
2. **Polyglot & Event-Driven Architecture (Chosen)**:
   * **MongoDB**: Unified Profile Aggregate & Raw JSON data (flexible schemas, nested JSON structures).
   * **PostgreSQL (Drizzle)**: Core operational records, sync jobs tracking, resume versions history, metadata logs.
   * **Redis Cache-Aside**: High-speed, transient cache for profile data and completion calculations.
   * **BullMQ (Redis-backed)**: Offload high-latency tasks (API fetches, PDF extraction, normalization pipelines) to background workers.
   * **EventBus**: Loose coupling via Pub/Sub to broadcast changes (e.g. `resume.processing.completed`, `profile.github.imported`).

## Decision Outcome
We implemented Option 2.

### Architecture Highlights:
* **The Normalization Engine (`ProfileNormalizationEngine`)**: Combines inputs based on configured source precedence (e.g., `manual` > `resume` > `linkedin` > `github`). Handles duplicate detection (by company + role, or university + degree) and resolves conflicts programmatically.
* **Resume Ingestion Pipeline**:
  * Scans uploads for malware synchronously using an Antivirus scan step.
  * Uploads to S3-compatible storage and triggers asynchronous parsing via BullMQ.
  * Implements duplicate detection using SHA-256 file hashes; identical files are linked directly to avoid reprocessing.
* **GitHub Ingestion Pipeline**:
  * Implemented as a separate microservice (`github-import-service`) following Clean Architecture.
  * Ingests repository metadata, commit activity, and language breakdowns.
  * Pauses the worker during API rate limits and resumes after the reset epoch passes (circuit breaker pattern).
* **Consent & Audit Logging**:
  * Tracks every consent grant/revocation, along with IP addresses and user agents.
  * GDPR delete cascades deletion through MongoDB profile, raw datasets, PostgreSQL logs, S3 files, and evicts all cache keys.
