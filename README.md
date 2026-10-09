# Familiar

A voice companion for people with mild dementia who spend a lot of time alone. It talks with them in AI-cloned voices of family and friends, recorded with their consent, and always tells the patient that the voices are AI.

Built for a health-themed hackathon (ElevenLabs "Best Use of Voice" track). Planned as a web app / PWA that runs on a phone or tablet.

> Status: planning. No code yet. The full build plan is in [PROJECT.md](PROJECT.md).

## What it does

- **Companion conversation:** the patient taps to talk, and Gemini replies in a family member's cloned voice with a personality that resembles theirs.
- **Voice rotation:** the conversation moves between several family voices to feel varied and real.
- **Reminders and check-ins:** the app speaks first at scheduled times, in a trusted voice.
- **Caregiver controls:** family sets topics to avoid or steer toward, and facts the AI must never get wrong.
- **Safety:** concerning statements notify caregivers; emergencies show a large "Call 911" button. The app never auto-dials.

## Principles

1. Transparent: voices are always labeled as AI recreations, and the AI never claims to be the real person.
2. Consent first: no voice is cloned without the owner's recorded consent.
3. Calm, simple, accessible UI.
4. Not medical advice.

## Planned stack

Next.js + TypeScript, Gemini (streaming), ElevenLabs (streaming TTS and Instant Voice Cloning), SQLite.

## Getting started (once Phase 0 is built)

```bash
cp .env.example .env.local   # add GEMINI_API_KEY and ELEVENLABS_API_KEY
npm install
npm run dev
```

Phones need HTTPS for microphone access, so use a tunnel or a deployed URL for device testing.

## Working with Codex

1. Give Codex [PROJECT.md](PROJECT.md).
2. Ask it to build **one phase at a time** (Phase 0 through 8) and stop when that phase's acceptance checks pass.
3. Commit after each phase.
4. Have Codex ask about anything listed under "Open Questions" in PROJECT.md instead of guessing.

## Project files

| File | Purpose |
|---|---|
| [PROJECT.md](PROJECT.md) | Product principles, scope, architecture (RESHADED), data model, prompts, safety protocol, build phases |
| `DECISIONS.md` | To be created during the build; log of decisions such as the speech-to-text choice |

## Reference

Voice and latency patterns come from the sibling `lila` repository (`src/speech.js`, `src/fast-talker.js`, `web/voice-player.js`). Port the patterns; do not copy the repository.
