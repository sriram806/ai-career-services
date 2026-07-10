# AI Career OS

<div align="center">

**AI-Powered Career Intelligence Platform**

[![CI](https://github.com/your-org/ai-career-os/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/ai-career-os/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-black.svg)](https://fastify.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](#)

</div>

---

## Architecture Overview

AI Career OS is a **microservices-based platform** built for millions of users. The system follows **Clean Architecture** and **Domain-Driven Design** principles with a monorepo managed by **Turborepo**.

```
┌─────────────────────────────────────────────────────────────┐
│                        API Gateway                          │
│                     (Fastify · :3000)                       │
├─────────┬─────────┬─────────┬─────────┬─────────┬──────────┤
│  Auth   │  User   │ Career  │  Exam   │   AI    │  Billing │
│ :3001   │ :3002   │ :3003   │ :3004   │ :3005   │  :3007   │
├─────────┼─────────┼─────────┼─────────┼─────────┼──────────┤
│  Org    │ Notif.  │ Admin   │Analytics│         │          │
│ :3006   │ :3008   │ :3009   │ :3010   │         │          │
├─────────┴─────────┴─────────┴─────────┴─────────┴──────────┤
│              Shared Packages (packages/*)                   │
├────────────────┬────────────────┬───────────────────────────┤
│   PostgreSQL   │    MongoDB     │         Redis             │
│    :5432       │    :27017      │         :6379             │
└────────────────┴────────────────┴───────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **API Gateway** | Fastify 5 |
| **Node.js Services** | Fastify, TypeScript Strict Mode |
| **Python Services** | FastAPI, Pydantic v2 |
| **Database (SQL)** | PostgreSQL 16, Drizzle ORM |
| **Database (NoSQL)** | MongoDB 7, Mongoose |
| **Cache / Pub-Sub** | Redis 7, ioredis |
| **Monorepo** | Turborepo + npm Workspaces |
| **CI/CD** | GitHub Actions |
| **Containerization** | Docker, Docker Compose |
| **Logging** | Pino (Node.js), structlog (Python) |
| **Validation** | Zod (Node.js), Pydantic (Python) |

---

## Folder Structure

```
ai-career-os/
├── apps/                          # Microservices
│   ├── gateway/                   # API Gateway (Fastify · :3000)
│   ├── auth-service/              # Authentication (:3001)
│   ├── user-service/              # User Management (:3002)
│   ├── career-service/            # Career Intelligence (:3003)
│   ├── exam-service/              # Examinations (:3004)
│   ├── ai-service/                # AI/ML Service (FastAPI · :3005)
│   ├── organization-service/      # Organizations (:3006)
│   ├── billing-service/           # Billing & Payments (:3007)
│   ├── notification-service/      # Notifications (:3008)
│   ├── admin-service/             # Platform Admin (:3009)
│   └── analytics-service/         # Analytics (FastAPI · :3010)
│
├── packages/                      # Shared Libraries
│   ├── types/                     # Shared TypeScript types & DTOs
│   ├── errors/                    # Error classes & error handler
│   ├── config/                    # Environment configuration (Zod)
│   ├── logger/                    # Pino logger & request logging
│   ├── common/                    # Response envelope, constants
│   ├── database/                  # PostgreSQL, MongoDB, Redis clients
│   ├── events/                    # Event bus (Redis Pub/Sub)
│   ├── utils/                     # Utility functions
│   └── validation/                # Zod schemas & validators
│
├── scripts/                       # Build & scaffolding scripts
├── docs/                          # Documentation
├── .github/workflows/             # CI/CD pipelines
├── docker-compose.yml             # Development infrastructure
├── turbo.json                     # Turborepo configuration
├── tsconfig.base.json             # Shared TypeScript config
├── .eslintrc.js                   # Shared ESLint config
├── .prettierrc                    # Shared Prettier config
└── package.json                   # Root workspace config
```

### Service Internal Structure

Every Node.js service follows Clean Architecture:

```
apps/{service-name}/
├── src/
│   ├── controllers/     # HTTP request handlers
│   ├── routes/          # Fastify route definitions
│   ├── services/        # Business logic layer
│   ├── repositories/    # Data access layer
│   ├── entities/        # Domain entities
│   ├── middlewares/      # Fastify hooks & middleware
│   ├── plugins/         # Fastify plugins
│   ├── config/          # Service-specific config
│   ├── schemas/         # JSON schemas for validation
│   ├── validators/      # Input validators
│   ├── dto/             # Data Transfer Objects
│   ├── events/          # Event publishers/subscribers
│   ├── jobs/            # Background jobs
│   ├── utils/           # Service utilities
│   ├── types/           # Service-specific types
│   ├── app.ts           # Fastify app factory
│   └── server.ts        # Entry point + graceful shutdown
├── tests/
│   ├── unit/
│   ├── integration/
│   └── helpers/
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Docker** & **Docker Compose**
- **Python** >= 3.11 (for AI & Analytics services)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/ai-career-os.git
cd ai-career-os

# 2. Copy environment variables
cp .env.example .env

# 3. Install Node.js dependencies
npm install

# 4. Start full Docker stack (all services + infra + client)
docker compose up -d --build

# 5. Build all packages
npm run build

# 6. Optional: run services locally without Docker
npm run dev
```

### One-Command Startup

```bash
# Start everything in Docker (infrastructure + microservices + frontend)
docker compose up -d --build

# Stop everything
docker compose down

# Stream logs
docker compose logs -f

# Rebuild a single service
docker compose build gateway
docker compose up -d gateway
```

### Docker Service Ports

| Service | Port |
|---------|------|
| Gateway | `3000` |
| Auth Service | `3001` |
| User Service | `3002` |
| Career Service | `3003` |
| Exam Service | `3004` |
| AI Service | `3005` |
| Organization Service | `3006` |
| Billing Service | `3007` |
| Notification Service | `3008` |
| Admin Service | `3009` |
| Analytics Service | `3010` |
| Client (Next.js) | `3100` |
| PostgreSQL | `5432` |
| MongoDB | `27017` |
| Redis | `6379` |
| pgAdmin | `5050` |
| Mongo Express | `8081` |

### Python Services Setup

```bash
# AI Service
cd apps/ai-service
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3005

# Analytics Service
cd apps/analytics-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 3010
```

---

## How to Run

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all services with hot reload |
| `npm run build` | Build all packages and services |
| `npm run lint` | Run ESLint across all services |
| `npm run format` | Format all files with Prettier |
| `npm run test` | Run all unit tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run typecheck` | TypeScript type checking |
| `npm run clean` | Clean all build artifacts |
| `docker compose up -d --build` | Start full stack (all services + infra + client) |
| `docker compose down` | Stop full stack |
| `docker compose logs -f` | Stream logs for all containers |

---

## Environment Variables

See [`.env.example`](.env.example) for all available environment variables.

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment name | `development` |
| `LOG_LEVEL` | Logging level | `debug` |
| `PORT` | Service port | `3000` |
| `POSTGRES_HOST` | PostgreSQL host | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `MONGO_URI` | MongoDB connection URI | `mongodb://...` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |

---

## Coding Standards

### TypeScript
- **Strict Mode** enabled — no `any` types allowed
- **ESLint** with `@typescript-eslint` rules
- **Prettier** for formatting (100 char width)
- **Consistent type imports** (`import type { ... }`)
- **Import ordering** enforced (builtin → external → internal)

### Python
- **Black** formatter (100 char width)
- **Ruff** linter
- **MyPy** static type checking
- **Pydantic v2** for data validation

### Commits
- **Conventional Commits** enforced via CommitLint
- Format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `infra`
- Scopes: `auth`, `user`, `career`, `exam`, `ai`, `org`, `billing`, `notification`, `admin`, `analytics`, `gateway`, `common`, `config`, `logger`, `database`, `events`, `types`, `utils`, `validation`, `errors`, `infra`, `ci`, `docs`, `deps`

### API Standards
- All responses follow the standard envelope format
- Errors include error codes, request IDs, and timestamps
- All endpoints documented via OpenAPI/Swagger

---

## Contribution Guide

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed guidelines.

### Quick Reference

1. Create a feature branch from `develop`
2. Follow the coding standards above
3. Write tests for new code
4. Run `npm run lint && npm run test` before committing
5. Use conventional commit messages
6. Create a PR to `develop`

---

## Development Tools

| Tool | URL |
|------|-----|
| **Gateway API** | http://localhost:3000 |
| **Gateway Swagger** | http://localhost:3000/docs |
| **AI Service Swagger** | http://localhost:3005/docs |
| **Analytics Swagger** | http://localhost:3010/docs |
| **pgAdmin** | http://localhost:5050 |
| **Mongo Express** | http://localhost:8081 |

---

## License

Proprietary — All rights reserved.
