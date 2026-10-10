import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { providerFetch } from "./provider-fetch";
import { DEFAULT_STOCK_VOICE_ID, voiceSettings } from "./config";
import { cleanSpeech, FIXED_PHRASES } from "./protocol";

const state = globalThis as unknown as {
  familiarStockVoice?: { id: string; expires: number };
  familiarFiller?: Map<string, Promise<Uint8Array>>;
  familiarSpeechBudget?: { day: string; used: number };
};

// Cost guard: a per-day character cap on generated speech protects the provider quota. Captions still show when it is reached.
export function spendSpeechBudget(characters: number, cap = voiceSettings().ttsDailyCharacterCap, today = new Date().toISOString().slice(0, 10)): void {
  const budget = state.familiarSpeechBudget?.day === today ? state.familiarSpeechBudget : (state.familiarSpeechBudget = { day: today, used: 0 });
  if (budget.used + characters > cap) throw new Error("Daily speech limit reached");
  budget.used += characters;
}

async function assertStockVoice(signal: AbortSignal, fetchProvider: typeof providerFetch) {
  const settings = voiceSettings();
  // The built-in provider stock voice needs only TTS scope. Other IDs must be
  // checked so a custom/cloned voice cannot bypass consent through configuration.
  if (settings.stockVoiceId === DEFAULT_STOCK_VOICE_ID) return;
  if (state.familiarStockVoice?.id === settings.stockVoiceId && state.familiarStockVoice.expires > Date.now()) return;
  const response = await fetchProvider(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(settings.stockVoiceId)}`, {
    headers: { "xi-api-key": settings.elevenlabsKey }, signal,
  });
  if (!response.ok) throw new Error("Stock voice unavailable");
  const voice = await response.json() as { category?: string };
  if (voice.category !== "premade") throw new Error("Phase 1 requires a stock voice");
  state.familiarStockVoice = { id: settings.stockVoiceId, expires: Date.now() + 300000 };
}

// `cloneVoiceId` is only passed after the caller has verified consent for that provider voice.
export async function streamSpeech(text: string, previousText: string, signal: AbortSignal, fetchProvider: typeof providerFetch = providerFetch, cloneVoiceId?: string): Promise<Response> {
  const settings = voiceSettings();
  if (!settings.elevenlabsKey) throw new Error("Speech provider not configured");
  const activeSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  if (!cloneVoiceId) await assertStockVoice(activeSignal, fetchProvider);
  const voiceId = cloneVoiceId ?? settings.stockVoiceId;
  const speech = cleanSpeech(text);
  if (!speech) throw new Error("No speech available");
  spendSpeechBudget(speech.length);
  const response = await fetchProvider(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`, {
    method: "POST", signal: activeSignal,
    headers: { "xi-api-key": settings.elevenlabsKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: speech, previous_text: cleanSpeech(previousText).slice(-300) || undefined,
      model_id: settings.ttsModel,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.85 },
    }),
  });
  if (!response.ok || !response.body) throw new Error("Speech provider unavailable");
  return response;
}

export type FillerVoice = { providerId: string; name: string } | null;

export function fillerText(phrase: keyof typeof FIXED_PHRASES, voice: FillerVoice): string {
  if (phrase === "disclosure" && voice) return `I'm an AI voice of ${voice.name}, recorded with their permission. I'm not ${voice.name}.`;
  return FIXED_PHRASES[phrase];
}

export function fillerKey(phrase: keyof typeof FIXED_PHRASES, voiceId: string, model: string, voice: FillerVoice = null): string {
  return createHash("sha256").update(JSON.stringify([voiceId, model, fillerText(phrase, voice), "mp3_44100_128", 0.85])).digest("hex");
}

export async function getFiller(phrase: keyof typeof FIXED_PHRASES, voice: FillerVoice = null): Promise<Uint8Array> {
  const settings = voiceSettings();
  const key = fillerKey(phrase, voice?.providerId ?? settings.stockVoiceId, settings.ttsModel, voice);
  // A phrase containing a family member's name is kept in memory only; fixed nonpersonal phrases may be cached on disk.
  const persist = !(voice && phrase === "disclosure");
  const cache = state.familiarFiller ??= new Map();
  if (!cache.has(key)) {
    const pending = (async () => {
      const root = path.resolve("data/filler");
      const filename = path.join(root, `${key}.mp3`);
      if (persist) {
        try {
          const bytes = await readFile(filename);
          if (bytes.length >= 100 && bytes.length <= 600000) return new Uint8Array(bytes);
        } catch { /* A cache miss is normal. */ }
      }
      const response = await streamSpeech(fillerText(phrase, voice), "", AbortSignal.timeout(30000), providerFetch, voice?.providerId);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 100 || bytes.length > 600000) throw new Error("Filler audio unavailable");
      if (persist) {
        try {
          await mkdir(root, { recursive: true });
          const temporary = `${filename}.tmp`;
          await writeFile(temporary, bytes);
          await rename(temporary, filename);
        } catch { /* Disk caching is optional. */ }
      }
      return bytes;
    })().catch((error: unknown) => { cache.delete(key); throw error; });
    cache.set(key, pending);
    if (cache.size > 16) cache.delete(cache.keys().next().value!);
  }
  return cache.get(key)!;
}
