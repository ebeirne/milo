# Familiar decisions

## October 9, 2026 — Phase 0

- **Database: PostgreSQL, selected by the user.** This replaces the original SQLite recommendation for every phase. The app uses `pg`, a server-only connection pool, and `DATABASE_URL`. JSON objects use JSONB, IDs use UUIDs, and timestamps use TIMESTAMPTZ. The `familiar` schema separates the app’s tables from other projects.
- **Migrations:** versioned, transactional, and protected by a PostgreSQL advisory lock. Run on first database access or through `npm run db:migrate`. Failed migrations roll back and can be retried. See [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) and [node-postgres transactions](https://node-postgres.com/features/transactions).
- **Local database:** Docker Compose configuration is provided. An existing PostgreSQL database also works. Development credentials in `.env.example` and Compose are public examples, not deployment credentials.
- **Tests:** PGlite runs an isolated PostgreSQL engine for migrations, constraints, and repository tests. It is a development dependency, never an app storage fallback. Live connectivity requires a running database and `DATABASE_URL`.
- **Phase boundaries:** Phase 0 only. No provider requests, voice cloning, reminders, or safety notifications. Setup saves a single household; dashboard sections clearly describe future features.
- **Brand:** keep the brief’s working name, Familiar. Cream, forest green, system fonts, large text, and simple controls. Final branding remains open.
- **Privacy:** provider keys and database credentials stay server-side. No browser storage or offline cache for personal data. No transcript endpoint or dashboard transcript view. A database constraint requires a consent record before storing a cloned voice; consent capture comes in Phase 2.
- **PWA:** manifest, install icons, Apple home-screen metadata, and standalone display. Offline conversations, push, and service-worker caching are outside Phase 0. See the [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps).
- **Access:** local demo scaffold, bound to loopback. No authentication yet. Add access controls before exposing setup or patient data publicly.
- **Still undecided:** deployment target, measured STT choice, long-term transcript retention, emergency location consent, rotation introductions, and demo plan. None blocks building the Phase 0 scaffold.
