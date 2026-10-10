// Records the landing page's voice sample, with word timings so the page can light up each word as it is
// spoken. It is a family voice greeting the person Milo is for: a stock ElevenLabs voice stands in for a
// granddaughter, because a real family voice needs its owner's recorded consent. The line was chosen by Jev
// (scripts/jev-copy.ts, slot "sample"), which rejected lines that pretend to be the real person.
//   node --env-file-if-exists=.env.local --import tsx scripts/make-sample.ts
import { mkdir, writeFile } from "node:fs/promises";

const TEXT = "Good morning, Grandpa. You're hearing an AI version of Nia's voice. How are the roses doing?";
const VOICE = "EXAVITQu4vr4xnSDxMaL"; // ElevenLabs "Sarah": young, warm, reassuring.
const NAME = "family-voice";

const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
  body: JSON.stringify({ text: TEXT, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.2, speed: 0.9 } }),
});
const body = await response.json();
if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);

// Group the per-character timings into words.
const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = body.alignment as { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
const words: { text: string; start: number; end: number }[] = [];
let current: { text: string; start: number; end: number } | null = null;
characters.forEach((character, index) => {
  if (/\s/.test(character)) { if (current) words.push(current); current = null; return; }
  if (!current) current = { text: "", start: starts[index], end: ends[index] };
  current.text += character;
  current.end = ends[index];
});
if (current) words.push(current);

await mkdir("public/sample", { recursive: true });
const audio = Buffer.from(body.audio_base64, "base64");
await writeFile(`public/sample/${NAME}.mp3`, audio);
await writeFile(`public/sample/${NAME}.json`, JSON.stringify({ audio: `/sample/${NAME}.mp3`, text: TEXT, voice: "ElevenLabs stock voice (Sarah) standing in for a family voice", duration: words.at(-1)?.end ?? 0, words: words.map((word) => ({ ...word, start: Math.round(word.start * 1000) / 1000, end: Math.round(word.end * 1000) / 1000 })) }, null, 1));
console.log(`wrote public/sample/${NAME}.mp3 (${audio.length} bytes) and ${words.length} word timings, ${words.at(-1)?.end.toFixed(1)}s`);
