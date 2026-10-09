# Familiar

A calm voice companion for people with mild dementia who spend time alone. Future phases add AI recreations of consenting family members' voices, always labeled as AI.

**Current build: Phase 0 scaffold.** Patient home, caregiver setup, PostgreSQL repository and migrations, accessible components, PWA manifest and icons, and a configuration health check. Voice conversations, cloning, reminders, summaries, and safety notifications are not implemented yet.

The source of truth is [PROJECT.md](PROJECT.md). PostgreSQL replaces the original SQLite recommendation at the user's request. Build one phase at a time and complete its acceptance checks before moving on.

## Run locally

Requires Node.js 22.13+ and a running PostgreSQL database (17+ recommended). Docker Compose is optional if you already have PostgreSQL.

```powershell
npm.cmd install
Copy-Item .env.example .env.local
# If using Docker Desktop:
docker compose up -d
npm.cmd run db:migrate
npm.cmd run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) for patient home and [http://127.0.0.1:3000/caregiver](http://127.0.0.1:3000/caregiver) for setup. On other shells, use `npm` instead of `npm.cmd`.

For an existing database, set `DATABASE_URL` in `.env.local` to its connection URL. The database user needs permission to create the `familiar` schema. Use your provider's required TLS settings in its URL; certificate verification is not disabled in code. Do not commit `.env.local`.

Phase 0 needs only `DATABASE_URL`. Leave Gemini and ElevenLabs keys blank until Phase 1. No provider is called in Phase 0.

Without a database, both pages still render. The caregiver page explains the connection problem and disables saving. No setup data is faked or saved in browser storage.

This scaffold is intended for a local demo. There is no authentication yet; development and production scripts bind to loopback. Add authentication before exposing patient data publicly. Phones will need HTTPS for microphone access in Phase 1.

## Checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Browser and accessibility checks: `npm.cmd run test:e2e`. On Windows they use installed Microsoft Edge. On other systems, first run `npx playwright install chromium`; optionally select a browser with `PLAYWRIGHT_CHANNEL`. The browser tests start and stop their own server on port 3100 and intentionally test the database-unavailable state without touching your database.

Tests use PGlite's isolated PostgreSQL engine for migrations, setup persistence, rollback, consent constraints, and parameterized queries. They do not need or write to your database. The application uses a regular PostgreSQL connection via `pg`.

Phase 0 checks: lint, typecheck, seven unit tests, four desktop/phone browser checks, and the production build pass. Migrations are verified against isolated PostgreSQL. A live PostgreSQL connection and setup save still require a running database with `DATABASE_URL`; these have not been verified on this machine. No Phase 1 work has started.

`GET /api/health` reports database readiness and provider-key presence as booleans, never secret values. Missing or unreachable PostgreSQL returns HTTP 503. A reachable database with absent voice keys returns HTTP 200 and `setup_required`, expected in Phase 0. Key presence does not verify provider account validity.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/app/` | Patient and caregiver routes, server action, health route, manifest |
| `src/components/` | Large buttons, screen shell, disclosure, setup form |
| `src/lib/db/` | PostgreSQL pool, versioned migrations, thin repository |
| `tests/` | Database and setup validation tests |
| `compose.yaml` | Local PostgreSQL, persistent volume, health check |
| `.env.example` | Environment template |
| [DECISIONS.md](DECISIONS.md) | Technical choices and remaining questions |

Migrations run on first database access or with `npm run db:migrate`. Patient and caregiver updates share a transaction. The schema includes every table in section 6 of the brief; later phases fill them in. The caregiver dashboard does not retrieve or expose conversation turns.

The PWA manifest supports standalone display and includes standard, maskable, and Apple icons. Offline conversation and push notifications are future work. Regenerate icons with `node scripts/generate-icons.mjs` after editing `public/icon.svg`.
