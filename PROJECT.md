# Familiar: Project Brief for Codex

> Working name: **Familiar** (rename freely). A voice companion for people with mild dementia who are often alone. It talks with them in the AI-cloned voices of family and friends, with the family's consent and with full transparency that the voices are AI.

This file is the source of truth. Build **one phase at a time** (see "Build Phases"). Do not start a phase until the previous phase's acceptance checks pass. Stop and ask when something in "Open Questions" blocks you.

---

## 1. Context

- **Event:** hackathon, about 40 hours over 3 days, mostly one developer.
- **Theme:** Health. **Sponsor track:** ElevenLabs "Best Use of Voice".
- **Platform:** responsive **web app / PWA** that runs full-screen on a phone or tablet. Native iOS and smart-speaker integration are roadmap only.
- **Users:**
  - **Patient:** mild dementia, lives alone or mostly alone, can use a simple UI. Not assumed to be tech-savvy.
  - **Caregiver / family:** sets up the app, records voices, and controls topics. Can also be the patient (self-setup must work).
- **Edge:** familiar cloned voices (ElevenLabs) with a personality sketch per person, rotating through a conversation, so the companionship feels real without being deceptive.

## 2. Product Principles (non-negotiable)

1. **Transparent, never deceptive.** The patient is always told that voices are AI recreations made with the person's permission. The AI never claims to *be* the real person, never claims to be physically present, and never invents shared memories not supplied by the family.
2. **Consent first.** A voice can only be created after the voice owner gives explicit, recorded consent. Voices of deceased people are out of scope for v1.
3. **Calm over clever.** Short sentences, slow pace, no jargon, large type, one primary action per screen. Never correct or quiz the patient. Redirect gently instead.
4. **Safety over charm.** Concerning statements trigger a tiered response (see Phase 6), never a silent ignore, never an auto-dial.
5. **Caregiver steers, patient is not surveilled blindly.** The patient is told during onboarding that family sees *summaries and flags*, not full transcripts.
6. **Not medical advice.** The app does not diagnose, dose, or advise on medication beyond repeating the caregiver-entered reminder.

## 3. Scope

### In scope (v1 demo)
- Caregiver onboarding with consent flow and voice recording (ElevenLabs voice cloning)
- Per-voice persona profile (relationship, speaking style, shared facts, topics)
- **Tap-to-talk** conversation: patient speaks, Gemini replies in a family voice
- **Voice rotation** across 2-3 family voices in a conversation
- **Scheduled check-ins** and reminders spoken in a family voice
- Caregiver **topics to avoid / steer toward** and **do-not-say facts**
- Transparent AI labeling in the UI and in speech
- Tiered safety escalation (notify caregiver; prompt patient to call 911)
- Caregiver summary view (daily summary and flags)

### Out of scope (roadmap, say so in the pitch)
- Always-listening / wake-word mode
- Smart speaker (Alexa / Google Home) integration
- Automatic 911 calling
- Full transcript review by caregivers
- Cloning deceased people's voices
- Native iOS app
- Multi-patient / clinic features, HIPAA compliance work (mention as future)

## 4. Tech Stack (recommended defaults)

| Concern | Choice | Notes |
|---|---|---|
| App | **Next.js (App Router) + TypeScript**, PWA manifest | Keys stay server-side in route handlers. |
| UI | Tailwind, large-type accessible components | Min 20px body text, 56px touch targets, high contrast. |
| LLM | **Gemini** via `@google/genai` or REST, **streaming** | Check current model names before coding; Lila's `.env.example` uses `gemini-3.5-flash-lite` for fast chat. |
| TTS + cloning | **ElevenLabs** streaming TTS, **Instant Voice Cloning** | Use the `/stream` TTS endpoint. Verify the current API and model ids in ElevenLabs docs before coding. |
| STT | Default: send recorded audio (MediaRecorder) directly to **Gemini** as audio input to save a hop. Alternative: ElevenLabs Scribe. | Decide in Phase 1 after measuring latency. |
| Storage | SQLite (`better-sqlite3`) behind a thin repository module | If deployed serverless, swap the repository for Supabase/Turso. Keep the interface small. |
| Scheduling | In-app: a client timer plus a server `/api/due-checkins` poll | v1 only works while the app is open; real push is roadmap. |
| Notifications to caregiver | In-app dashboard flag plus optional email or SMS stub | Use a stub interface; do not wire real SMS unless time allows. |
| Hosting | Local + HTTPS tunnel for phone demo, or Vercel | Microphone access requires HTTPS on phones. |

Secrets go in `.env.local` (never committed). Provide `.env.example`:
```
GEMINI_API_KEY=
GEMINI_CHAT_MODEL=
ELEVENLABS_API_KEY=
ELEVENLABS_TTS_MODEL=
DATABASE_PATH=./data/familiar.db
```

## 5. Reuse From the Lila Repo

Source: `C:\Users\gurte\OneDrive\Documents\dev\lila` (Node/Electron desktop agent). **Port patterns, do not copy the whole repo.** Ignore all computer-control, Chrome connector, Codex-bridge, Electron, and desktop-policy code.

| Need | Lila reference | What to take |
|---|---|---|
| Streaming ElevenLabs TTS | `src/speech.js` | POST to `/v1/text-to-speech/{voice_id}/stream`, `mp3_44100_128`, abort via `AbortSignal`, 30s timeout, `previous_text` to keep intonation across sentence-by-sentence synthesis, pre-v3/v4 models strip voice cues. |
| Connection reuse / low latency | `src/keepalive-fetch.js` | Keep-alive fetch wrapper. |
| Instant filler audio | `src/instant-phrases.js`, `src/public-speech-cache.js` | Pre-synthesize fixed short phrases once per voice ("Hmm.", "One moment.") and cache; play instantly while the model thinks. **Per-voice cache key** (voice id + model + text). Only cache fixed non-personal phrases. |
| Fast streaming Gemini reply | `src/fast-talker.js`, `src/gemini-companion.js` | Streaming, short replies (1-2 sentences), history windowing (last ~8 turns, char-capped), thinking filler to hold the floor on slow first token, `RouteStream` idea of parsing control labels out of the stream. |
| Browser playback queue | `web/voice-player.js` | Web Audio queue that plays sentence chunks back-to-back, `VoicePlaybackAudit` states, speech-driven waveform visual. |
| Turn-taking | `web/voice-turn-policy.js`, `web/stop-commands.js` | Stop/interrupt handling. In v1, **tap-to-talk** only, but a big Stop button must cut audio immediately. |
| Latency metrics | `src/response-latency.js` | Record `firstPhraseMs`, `firstPlaybackMs`, `playbackCompleteMs`; expose on a debug panel. Target: first audio in about 1s. |
| Memory of lasting facts | `src/companion-memory.js`, `[[remember: ...]]` pattern | Model proposes a fact; caregiver approves it before it persists (do not auto-store everything). |

Latency approach to implement (the pipeline is STT -> LLM -> TTS, and every hop adds delay):
1. Start playing a cached filler in the chosen voice as soon as the patient finishes speaking.
2. Stream Gemini tokens; cut into sentences at `.?!`.
3. Send each sentence to ElevenLabs `/stream` as soon as it is complete, passing `previous_text`; queue chunks in Web Audio.
4. Keep replies to 1-2 sentences.
5. Log timings per turn.

## 6. Data Model (SQLite)

- `patient` (id, name, preferred_name, birth_year?, notes, ai_disclosure_acknowledged_at, created_at)
- `caregiver` (id, patient_id, name, email, phone?, role)
- `voice_profile` (id, patient_id, display_name, relationship, elevenlabs_voice_id, consent_recorded_at, consent_audio_ref?, consenter_name, persona_json, active, created_at)
  - `persona_json`: speaking style, common phrases, humor level, pet names for patient, facts the AI may reference, facts it must not claim
- `topic_rule` (id, patient_id, kind: `avoid|steer|never_say`, text)
- `memory_fact` (id, patient_id, text, source: `caregiver|proposed`, approved_at?)
- `reminder` (id, patient_id, voice_profile_id, text, schedule_json, last_fired_at?)
- `checkin` (id, patient_id, voice_profile_id, time_of_day, days, prompt_style)
- `conversation` (id, patient_id, started_at, ended_at, summary?, mood?)
- `turn` (id, conversation_id, voice_profile_id, role, text, created_at) -- stored for continuity, **not shown in full to caregivers**
- `flag` (id, patient_id, conversation_id?, tier: `concern|possible_emergency|emergency`, reason, created_at, acknowledged_by?, acknowledged_at?)

## 7. System Prompt Contract (Gemini)

Build the system prompt per turn from: global safety rules + active voice persona + topic rules + approved memory facts + current time/date + recent history. Required rules in the prompt:

- You are an **AI companion speaking in a recreation of {name}'s voice, with {name}'s permission**. You are not {name}. If the patient asks whether you are the real person, answer kindly and truthfully, then offer comfort and a way to reach them ("That was a recording of my voice that Sarah made for you. She loves you very much. Want me to remind you to call her this afternoon?"). Do not make them feel foolish for asking.
- Speak in {name}'s style (from persona), warm, slow, 1-2 short sentences, one idea at a time.
- Only reference facts supplied in persona or approved memory. Never invent shared history. If unsure, ask a gentle open question.
- Never contradict or quiz the patient. If they are confused about the date, person, or place, gently ground them ("It's Thursday morning") and redirect.
- Respect `avoid`, `steer`, and `never_say` rules. Never state that a deceased person is alive.
- No medical, legal, or financial advice. Medication: only repeat the caregiver's reminder text.
- If the patient mentions a fall, pain, being lost, unsafe, hopeless, or not taking meds, follow the SAFETY protocol (below) and emit the control label.
- Control labels (stripped before speech): `[[mood:calm|happy|sad|anxious|confused]]`, `[[flag:concern|possible_emergency|emergency]]`, `[[remember: third-person fact]]`.

## 8. Safety Protocol

Gemini output is probabilistic. Use **two layers**: (a) the model's `[[flag]]` label and (b) a deterministic keyword/regex screen on the patient's text ("I fell", "can't breathe", "chest", "help", "want to die", "don't know where I am", etc.). Escalate if either fires.

| Tier | Trigger | App behavior |
|---|---|---|
| `concern` | sadness, loneliness, confusion, skipped meds | Respond kindly; add to caregiver dashboard; include in daily summary. |
| `possible_emergency` | fall, pain, lost, feeling unsafe | Companion asks one clear question: "Do you need help? Should I call Sarah, or 911?" Immediately notify caregivers. |
| `emergency` | patient confirms, or severe keywords | Show a **large "Call 911" button** (`tel:911`), notify caregivers with time and (if permitted) location. **Never auto-dial.** |

Self-harm language: respond with calm support, encourage contacting a caregiver, show the US 988 option, notify caregivers. Do not attempt therapy. Keep a list of safety keywords in one config file so they are easy to review.

---

## 8b. Architecture Review (RESHADED)

Gap-fill so the design is checked against the RESHADED method. Estimates are rough planning numbers; replace them with measured values after Phase 1.

**Requirements**
- Functional: FR1 consented voice cloning; FR2 tap-to-talk conversation; FR3 persona and rotation; FR4 caregiver rules and memory; FR5 scheduled reminders and check-ins; FR6 tiered safety escalation; FR7 caregiver summaries and flags.
- Non-functional: NFR1 first audio about 1.5s after the patient stops talking; NFR2 Stop silences within 300ms; NFR3 API keys never reach the client; NFR4 patient audio and transcripts are minimized and deleted per the retention rule below; NFR5 accessible UI (large type, high contrast, one primary action); NFR6 degrades gracefully when a provider fails.

**Estimation** (1 patient, demo scale)
- About 20 turns/day x about 40 spoken words per reply is about 5k TTS characters/day, plus reminders and check-ins. Per-day TTS character cap (config) protects the ElevenLabs quota.
- Gemini: about 20 turns x about 1.5k prompt tokens (persona, rules, 8-turn history) is about 30k input tokens/day, which is small.
- Storage: text only is negligible. Voice samples (1-3 min each) are kept only in ElevenLabs; the consent recording is kept locally (about 1 MB each).
- Concurrency: effectively 1-5 sessions. No scaling work needed for v1; note the horizontal path in the pitch.

**High-level design**
```
Browser PWA (patient)  --audio-->  /api/converse  --> Gemini (stream text)
        ^                               |                    |
        |<-- sentence audio chunks <-- /api/tts <-- ElevenLabs /stream
        |                               |
        |                          safety.ts (keywords + [[flag]])
        |                               |
Caregiver UI --> /api/* --> SQLite (repository)  <-- scheduler (due check-ins)
                                        |
                              notify (stub: dashboard / email)
```

**APIs** (all server-side; keys never exposed)
- `POST /api/converse` (audio or text in; text/sentence stream out)
- `POST /api/tts` (voice id + sentence + `previous_text`; audio stream out)
- `POST /api/voices` / `DELETE /api/voices/:id` (clone with consent record; delete)
- `POST /api/record-links` / `GET /r/:token` (remote voice recording page)
- `GET|POST /api/rules`, `/api/facts`, `/api/reminders`, `/api/checkins`
- `GET /api/due` (due reminders and check-ins)
- `GET /api/flags`, `POST /api/flags/:id/ack`
- `GET /api/summary`

**Detailed design:** see sections 5 (latency), 7 (prompt contract), 8 (safety) and Phase 3 (rotation).

**Evaluation** (tradeoffs and failure modes)
- ElevenLabs down or quota hit: show text with a caption and an apology, notify the caregiver; never go silent. (Local-voice fallback is dev-only and must be labeled as not the family's voice.)
- Gemini slow or down: cached filler, then a canned kind message ("I'm having trouble right now. I'll let {caregiver} know.").
- Mic denied or unsupported: guided help screen and a typed-input fallback.
- Cloned voice quality poor: re-record flow; fall back to a stock voice labeled as such.
- Misclassified safety event: two-layer screen biases toward over-flagging to the caregiver, but never auto-dials 911.
- Retention rule (default): keep turns for the active conversation plus 7 days for continuity, then keep only summaries. Revisit in Open Questions.
- Tradeoff: tap-to-talk is less natural than always-listening, but is cheaper, more private, and more reliable for a demo.

**Distinctive component:** the **consented family-voice engine**: remote record link -> consent capture -> ElevenLabs clone -> persona -> transparent rotation with per-voice cached filler. This is the part to polish and demo first.

---

## 9. Build Phases

Each phase lists **Goal, Tasks, Acceptance, Not yet**. Estimated hours total about 38. Commit at the end of every phase.

### Phase 0: Scaffold (about 2h)
**Goal:** runnable app, env, DB, design tokens.
- Next.js + TS + Tailwind project; PWA manifest and icons; `.env.example`; `.gitignore` includes `.env.local` and `data/`.
- Repository module for SQLite with migrations for the schema in section 6.
- Accessible base components: `BigButton`, `ScreenShell`, `Banner` (AI disclosure).
- Two routes: `/` (patient home) and `/caregiver` (setup/dashboard).
- Health check route verifying env keys are present (never print them).

**Acceptance:** `npm run dev` serves both routes; DB file is created; lint and typecheck pass.
**Not yet:** any AI calls.

### Phase 1: Talk loop with one stock voice (about 6h) ★ riskiest, do early
**Goal:** tap -> speak -> hear a Gemini reply in an ElevenLabs voice with low latency.
- `POST /api/converse`: accepts audio blob plus conversation id; returns a streamed response (sentence-level text events plus audio chunks), or two endpoints: `/api/converse` (text stream) and `/api/tts` (stream audio per sentence).
- Client: tap-to-talk button (hold or tap-tap), MediaRecorder, waveform, **Stop** button, Web Audio sentence queue (port from `web/voice-player.js`).
- STT decision: try Gemini audio input first; measure; fall back to Scribe if accuracy or latency is poor on iOS Safari. Record the decision in `DECISIONS.md`.
- Filler phrases cached per voice (port `instant-phrases` and `public-speech-cache`).
- Latency debug panel (`?debug=1`) showing per-turn timings.

**Acceptance:** on a phone over HTTPS, first audio within about 1.5s of releasing the button on a typical turn (record actual numbers); Stop silences audio within 300ms; no keys reach the browser.
**Not yet:** cloning, personas, rotation.

### Phase 2: Voice cloning and consent (about 5h) ★ the edge
**Goal:** a family member records their voice and a usable cloned voice appears.
- Caregiver flow `/caregiver/voices/new`: name, relationship -> **consent screen** (voice owner reads a typed consent statement aloud; store timestamp, consenter name, and the consent recording reference) -> record 1-3 minute sample with a guided script and noise/level feedback -> upload to ElevenLabs Instant Voice Cloning -> store `elevenlabs_voice_id`.
- Remote-friendly: a shareable **record link** so a far-away relative can record on their own phone (token-based, expires; no account).
- Preview: play a test sentence in the new voice; allow delete (call ElevenLabs delete and remove the row).
- Handle failures: too short, too noisy, API errors.

**Acceptance:** record a voice on a phone and hear a recognizable test sentence; deleting removes the ElevenLabs voice and the DB row; no voice can be created without a stored consent record.
**Not yet:** persona prompts.

### Phase 3: Personas and voice rotation (about 5h)
**Goal:** each voice speaks in a distinct style; conversation moves between voices.
- Persona form per voice: relationship, how they talk, pet names, humor, 3-8 shared facts (what the AI may reference), "never claim" list.
- Prompt builder implements the contract in section 7 (unit-test it with snapshot tests).
- **Rotation policy** (configurable): `single`, `round_robin_per_topic`, `random_weighted`. Default: switch voice every 2-4 turns or on topic change, with a spoken handoff ("Mike here, Sarah told me you went to the garden today"). Avoid switching mid-sentence or mid-distress (stay on the last voice if mood is anxious or sad).
- UI always shows who is speaking: photo, name, and the label "AI voice of {name}, recorded with their permission."
- Patient asks "who is this?" -> truthful answer via system prompt.

**Acceptance:** a 10-turn scripted conversation uses at least 2 voices, each stays in style; transparency answer appears when asked; persona tests pass.
**Not yet:** topic rules, reminders.

### Phase 4: Caregiver controls and memory (about 4h)
**Goal:** the caregiver steers what the AI says.
- Topic rules UI: avoid / steer / never-say lists (with examples such as "Maria passed away in 2019, never say she is alive").
- Approved memory facts: caregiver adds facts; AI-proposed `[[remember]]` facts appear in a review queue and are only used after approval.
- Rules are injected into every prompt and validated by tests (e.g. input that invites a banned topic -> reply avoids it).
- Patient onboarding screen (shown once, read aloud): explains the AI voices and that family sees summaries.

**Acceptance:** adding an "avoid" topic changes behavior in a scripted test; unapproved facts never appear in prompts; disclosure acknowledgement timestamp saved.

### Phase 5: Scheduled check-ins and reminders (about 4h)
**Goal:** the app speaks first.
- Caregiver creates reminders (text, time, days, voice) and check-ins (time of day, voice, style).
- While the app is open, a scheduler triggers a gentle chime then the voice speaks ("Good morning, it's Mike's voice. Time for your morning pills, the ones on the kitchen table."). Patient taps "Done" or "Remind me later" or talks back.
- Missed/unacknowledged reminder after N minutes creates a `concern` flag.
- Reminders reuse the cached-audio path (pre-generate audio at save time to avoid latency and cost).

**Acceptance:** a reminder set 1 minute ahead fires and speaks in the correct voice; "Done" is logged; ignoring it raises a flag.
**Not yet:** background push notifications (roadmap; document the limitation honestly).

### Phase 6: Safety escalation (about 4h)
**Goal:** implement the tiers in section 8.
- Central `safety.ts`: keyword screen plus parse `[[flag]]`; return the max tier.
- Possible emergency -> confirmation prompt; emergency -> big `tel:911` button and caregiver notification via the notification interface (stub: dashboard banner plus console/email mock).
- Caregiver dashboard shows flags (acknowledge button).
- Tests: table-driven phrases -> expected tier; include false-positive cases ("my hip doesn't hurt anymore").

**Acceptance:** scripted phrases produce the right tier; emergency never auto-dials; caregiver sees and can acknowledge flags.

### Phase 7: Caregiver dashboard and daily summary (about 3h)
- End of conversation: Gemini produces a short summary plus mood. Dashboard shows today's summary, mood trend, flags, reminder completion. **No raw transcripts.**
- Patient-facing note on what family can see.

**Acceptance:** after a demo conversation, the dashboard shows a summary, mood, and flags.

### Phase 8: Polish and demo prep (about 5h)
- Patient home: one giant "Talk" button, who's-speaking card, volume control, simple help.
- Accessibility pass: contrast, large type, `prefers-reduced-motion`, screen-reader labels.
- Seed script: demo patient, 3 voices (team members), personas, rules, reminders.
- Error states: no mic permission, offline, API failure (the companion says "I'm having trouble, I'll let Sarah know" rather than silence).
- Rate limiting and cost guard (per-day character cap on TTS); `README.md` with run instructions and `DECISIONS.md`.
- Demo script (to be written later with the user).

**Acceptance:** full demo path runs twice in a row from a clean seed on a phone.

---

## 10. Quality Bar

- Typecheck, lint, and unit tests (prompt builder, safety screen, rotation policy) pass before each phase commit.
- No secrets in client bundles; verify with a build grep.
- Log timings, never log raw patient speech to console in production mode.
- Every AI-facing string that introduces a voice includes the AI disclosure.
- Prefer small, reviewable commits; one commit per phase minimum.

## 11. Decisions Already Made (from planning)

- Patient may self-set-up; caregivers and family can also set up.
- Primary value is **companionship**; reminders are secondary but included.
- Voices come from family and friends recording themselves, with consent.
- **Transparent** AI voices, with a personality resembling each voice's owner.
- Caregivers can set topics to avoid and steer toward.
- Emergencies alert caregivers and surface 911 (patient confirms; no auto-dial).
- v1 interaction: **tap-to-talk and scheduled check-ins**. Always-listening is a later option.
- Platform: web/PWA first.

## 12. Open Questions (ask the user; do not guess)

1. Project name and branding.
2. Whether to deploy (Vercel) or demo locally with a tunnel.
3. STT choice after Phase 1 measurements.
4. Whether conversation turns are retained long-term or purged after summary (privacy stance for the pitch).
5. Does the caregiver see location during an emergency? (consent and permission design)
6. Demo plan and video (to be discussed later).
7. Whether to include a spoken "who's talking" intro every time a voice rotates, or only when the patient seems unsure.

## 13. Pitch Hooks (for later)

- "Lonely isn't a feature request, it's a health condition." Familiar voices lower anxiety and prompt routine adherence.
- ElevenLabs track: consented cloning flow, remote record link, per-voice filler cache for low latency, expressive handoffs between voices, safety-aware tone.
- Honest roadmap: wake word, smart speakers, push, clinician reports, deceased-loved-one policy with ethics review.
