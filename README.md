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

Familiar is in early development. Patient home, caregiver setup, stock-voice conversations, and consented family voice recording, cloning, previews, and deletion are available when the database and providers are configured. Family voices will be connected to conversations alongside personas and rotation. Scheduling and caregiver summaries are planned.

## Tech stack

| Layer | Technology |
| --- | --- |
| Application | Next.js App Router, React, TypeScript |
| Interface | Tailwind CSS, Lucide icons, accessible components |
| Database | PostgreSQL with `pg`, connection pooling, and transactional migrations |
| Conversation | Claude Sonnet 5.5 via the Anthropic Messages API; Gemini fallback |
| Transcription | Gemini audio input |
| Reply evaluation | TypeSafe Jev, running after replies in the background |
| Speech and cloning | ElevenLabs streaming TTS and Instant Voice Cloning |
| Recording validation | FFmpeg audio decoding, duration/level checks, Gemini consent transcription |
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
| `ANTHROPIC_API_KEY` | Anthropic credential for the primary conversation model |
| `SONNET_CHAT_MODEL` | Defaults to `claude-sonnet-5-5` |
| `CONVERSATION_PROVIDER` | `sonnet` (default) or `gemini` |
| `GEMINI_API_KEY` | Gemini credential for transcription and fallback conversation |
| `GEMINI_CHAT_MODEL` | Fallback model; defaults to `gemini-3.5-flash-lite` |
| `GEMINI_STT_MODEL` | Transcription model; defaults to `gemini-3.5-flash-lite` |
| `TYPESAFE_API_KEY` | Enables Jev's background reply evaluations |
| `JEV_MODEL` | Defaults to `jev-latest` |
| `ELEVENLABS_API_KEY` | ElevenLabs credential; required for speech |
| `ELEVENLABS_TTS_MODEL` | Speech model; defaults to `eleven_flash_v2_5` |
| `ELEVENLABS_STOCK_VOICE_ID` | Premade voice ID; defaults to the provider's George example voice |
| `PUBLIC_APP_URL` | HTTPS origin used for recording invitations on other devices |
| `CAREGIVER_ACCESS_CODE` | Long random access code (16+ characters) for remotely accessed patient/caregiver pages |

Only `DATABASE_URL` is required for setup. Add Anthropic, Gemini, and ElevenLabs keys for the full conversation pipeline. If the Anthropic key is absent, Gemini keeps conversations working. A missing TypeSafe key disables evaluation without disabling conversation. Model and stock-voice values have defaults. Custom or cloned voices are not accepted by the stock-voice integration. The database user needs permission to create the `familiar` schema. For hosted PostgreSQL, use the provider's connection URL and required TLS settings. Migrations run on first database access or explicitly with `npm run db:migrate`.

The ElevenLabs key needs **Text to Speech** (`text_to_speech`). The built-in George stock voice works with that permission alone. To configure another stock voice ID, also enable **Voices → Read** (`voices_read`); Familiar verifies that other IDs are premade voices before generating speech.

Family voice creation and deletion also need **Voices → Write** (`voices_write`) and a plan with Instant Voice Cloning and available voice slots. If ElevenLabs requires voice-owner verification, complete that in ElevenLabs and use **Check verification** in the library; that status check needs Voices → Read. The app will not preview a voice while required verification is pending.

Without a database connection, pages still render and setup saving is disabled. `/api/health` reports database readiness and provider-key presence without returning credentials.

The server scripts bind to loopback. Localhost works without an access code. Before sharing recording links outside localhost, configure `PUBLIC_APP_URL` with the HTTPS origin and set a long random `CAREGIVER_ACCESS_CODE`. Patient and caregiver pages then require an access-code session. Recording invitees use their scoped link without an account or access code; they cannot access household pages through it. This is a single-household demo gate, not a production identity system. Microphone access works on localhost; phones need HTTPS.

### Family voice recording

Open **Family voice library** from caregiver setup, or visit `/caregiver/voices`. Choose **Record my voice**, enter the living voice owner's name and relationship, and follow the three steps:

1. Confirm the recording belongs to you.
2. Agree to the stated use and record the full consent statement exactly as written.
3. Record 1–3 minutes of clear speech, listen back, and explicitly choose **Create my AI voice**.

The server decodes both recordings and verifies their actual duration and basic audio quality. Gemini transcribes the consent; names, permission, AI labeling, and deletion rights must match the full statement. Negated or withdrawn permission is rejected. Consent evidence is saved before any cloning request. Samples are converted to MP3 for ElevenLabs; temporary local samples are removed after processing. Consent recordings stay under the ignored `data/consent/` directory until voice deletion.

The library provides an AI-labeled test preview and a confirmation step for deletion. Deletion removes the provider voice, local profile, associated invitation, and consent recording. Failed deletions can be retried. A request with an uncertain provider result is held for manual review rather than automatically creating another voice. Recordings and consent attestations do not provide biometric identity verification; the living owner must record their own voice.

For a distant family member, create a recording invitation with their name and relationship. Links expire after 24 hours, allow one successful enrollment, and expose only the invited recording details. The owner can preview the new voice through the link until it expires. Only the token hash is stored in PostgreSQL. A localhost link cannot be opened from someone else's phone; configure the HTTPS origin before sharing it.

Voice creation and deletion are tested with provider stubs. A recognizable clone and physical-phone recording quality require a genuine living owner's consent and sample; synthetic test audio is never used to create a real voice.

### Conversations

Complete family setup, then return to the companion home. Tap **Talk**, allow microphone access, and tap **Finish speaking** to send the recording. **Stop** immediately cuts playback and cancels the turn; stopping while recording discards it. A typed-message option is available when a microphone cannot be used.

Gemini transcribes recorded audio, then Sonnet streams a short, conversational reply. Typed messages go straight to Sonnet. Gemini is available as a fallback when Sonnet is missing or fails before emitting text; a partially spoken reply is never combined with another model's response. Each completed sentence is synthesized through ElevenLabs and queued with Web Audio in order. Fixed, non-personal filler and disclosure audio are cached per voice and model under the ignored `data/filler/` directory. Dialogue audio is not cached or saved by Familiar; provider retention follows the provider account's settings. Captions remain available when speech fails.

Jev reviews completed replies for invented memories, family impersonation, medical advice, and confusing wording. Reviews run after the response finishes and do not delay or change speech. Only structured judgments are stored; no second copy of the transcript is saved with an evaluation. Each review is tied to its specific reply, so delayed results cannot be mistaken for a newer turn. Confidence is a measure of the model's judgment, not verified correctness. Reviews do not trigger emergency actions.

Conversation text stays on the server for continuity, with the last eight turns included in requests. Turns older than seven days are purged when a conversation starts or resumes. Raw transcripts are not available in the caregiver interface. Caregiver notifications and emergency escalation are not yet implemented.

Open `/?debug=1` after setup, or `/talk?debug=1`, to see first-sentence, first-audio, first-reply-audio, playback-completion, and Stop timings, the conversation provider used, and the current reply's Jev review. First audio includes cached filler; it is reported separately from the first generated reply. These measurements describe browser playback, not proof of speaker audibility.

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
| `npm run check:models` | Compare live models using synthetic prompts and run Jev reviews |

Unit tests use isolated PostgreSQL through PGlite and test provider protocols without contacting paid services. Browser tests start their own server on port 3100 and use a fake microphone and synthetic audio to verify recording, sentence order, cancellation, accessibility, and failures. They do not establish live-provider or physical-phone latency. On Windows they use installed Microsoft Edge; on other systems, run `npx playwright install chromium` first. Set `PLAYWRIGHT_CHANNEL` to select another supported browser channel.

`check:models` contacts configured providers and uses API quota. It prints replies to fixed synthetic prompts, timings, and Jev judgments without reading patient records. Missing keys are reported explicitly. An optional synthetic WAV can be supplied with `npm run check:models -- path/to/test.wav` to check transcription without printing its words.

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
