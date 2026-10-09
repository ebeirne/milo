# Familiar

A voice companion for people with mild dementia who spend time alone. Familiar is designed to offer warm, simple conversations in AI recreations of family and friends' voices, recorded with their permission and clearly labeled as AI.

The app runs in a browser on phones, tablets, and computers, with a PWA manifest for a home-screen experience.

## How it works

The intended experience brings together:

- **Familiar conversations:** tap to talk and hear a short, gentle reply in a consenting loved one's recreated voice.
- **Personal touches:** voice profiles describe speaking styles, relationships, and shared facts the companion may reference.
- **Family controls:** caregivers choose topics to encourage or avoid and approve lasting memories.
- **Daily connection:** scheduled check-ins and reminders support everyday routines.
- **Caregiver summaries:** short summaries and concerns help family stay informed without exposing full transcripts.

Voice owners must give recorded consent before cloning. The companion always identifies voices as AI recreations, never impersonates the real person, and never invents shared memories. It is not a source of medical advice. The planned emergency flow surfaces call options and alerts caregivers; it never automatically dials.

Familiar is in early development. Patient home, caregiver setup, and database persistence are available. Conversation, voice recording, personalization, scheduling, and caregiver summaries are planned.

## Tech stack

| Layer | Technology |
| --- | --- |
| Application | Next.js App Router, React, TypeScript |
| Interface | Tailwind CSS, Lucide icons, accessible components |
| Database | PostgreSQL with `pg`, connection pooling, and transactional migrations |
| Conversation and audio input (planned) | Gemini |
| Voice cloning and speech (planned) | ElevenLabs |
| Local database | Docker Compose |
| Testing | Node.js test runner, PGlite, Playwright, axe-core |

Database access and provider credentials stay on the server. The interface uses large text, generous touch targets, and reduced-motion support.

## Getting started

Requires Node.js 22.13+ and PostgreSQL. The included Docker Compose configuration uses PostgreSQL 17; an existing local or hosted PostgreSQL database also works.

```powershell
npm.cmd install
Copy-Item .env.example .env.local
docker compose up -d
npm.cmd run db:migrate
npm.cmd run dev
```

On other shells, use `npm` instead of `npm.cmd` and `cp .env.example .env.local` to copy the environment template. Skip `docker compose up -d` if using an existing database.

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) for the companion home or [http://127.0.0.1:3000/caregiver](http://127.0.0.1:3000/caregiver) for family setup.

### Configuration

Set environment values in `.env.local`, which is ignored by Git.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL; required to save setup details |
| `GEMINI_API_KEY` | Gemini credential for the planned conversation integration |
| `GEMINI_CHAT_MODEL` | Gemini model selection |
| `ELEVENLABS_API_KEY` | ElevenLabs credential for planned voice features |
| `ELEVENLABS_TTS_MODEL` | ElevenLabs speech model selection |

Only `DATABASE_URL` is required for the current app. The database user needs permission to create the `familiar` schema. For hosted PostgreSQL, use the provider's connection URL and required TLS settings. Migrations run on first database access or explicitly with `npm run db:migrate`.

Without a database connection, pages still render and setup saving is disabled. `/api/health` reports database readiness and provider-key presence without returning credentials.

The current app is intended for local development: authentication is not yet implemented, and the server scripts bind to loopback. Public deployment needs access controls. Microphone access on phones will require HTTPS when voice features are available.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve the production build |
| `npm run db:migrate` | Apply PostgreSQL migrations |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run database and validation tests |
| `npm run test:e2e` | Run browser and accessibility checks |

Unit tests use isolated PostgreSQL through PGlite and do not touch your database. Browser tests start their own server on port 3100. On Windows they use installed Microsoft Edge; on other systems, run `npx playwright install chromium` first. Set `PLAYWRIGHT_CHANNEL` to select another supported browser channel.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/app/` | Pages, server actions, health endpoint, and PWA manifest |
| `src/components/` | Shared interface components |
| `src/lib/db/` | PostgreSQL connection pool, migrations, and repository |
| `tests/` | Database, validation, browser, and accessibility tests |
| `public/` | App icons and static assets |
| `scripts/` | Migration and icon-generation utilities |
| `compose.yaml` | Local PostgreSQL service with persistent storage |

Regenerate home-screen icons with `node scripts/generate-icons.mjs` after editing `public/icon.svg`.
