import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { providerFetch } from "./provider-fetch";
import { voiceSettings } from "./config";
import { cleanSpeech, FIXED_PHRASES } from "./protocol";

const state = globalThis as unknown as {
  familiarStockVoice?: { id: string; expires: number };
  familiarFiller?: Map<string, Promise<Uint8Array>>;
};

async function assertStockVoice(signal: AbortSignal, fetchProvider: typeof providerFetch) {
  const settings = voiceSettings();
  if (state.familiarStockVoice?.id === settings.stockVoiceId && state.familiarStockVoice.expires > Date.now()) return;
  const response = await fetchProvider(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(settings.stockVoiceId)}`, {
    headers: { "xi-api-key": settings.elevenlabsKey }, signal,
  });
  if (!response.ok) throw new Error("Stock voice unavailable");
  const voice = await response.json() as { category?: string };
  if (voice.category !== "premade") throw new Error("Phase 1 requires a stock voice");
  state.familiarStockVoice = { id: settings.stockVoiceId, expires: Date.now() + 300000 };
}

export async function streamSpeech(text: string, previousText: string, signal: AbortSignal, fetchProvider: typeof providerFetch = providerFetch): Promise<Response> {
  const settings = voiceSettings();
  if (!settings.elevenlabsKey) throw new Error("Speech provider not configured");
  const activeSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  await assertStockVoice(activeSignal, fetchProvider);
  const speech = cleanSpeech(text);
  if (!speech) throw new Error("No speech available");
  const response = await fetchProvider(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(settings.stockVoiceId)}/stream?output_format=mp3_44100_128`, {
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

export function fillerKey(phrase: keyof typeof FIXED_PHRASES, voiceId: string, model: string): string {
  return createHash("sha256").update(JSON.stringify([voiceId, model, FIXED_PHRASES[phrase], "mp3_44100_128", 0.85])).digest("hex");
}

export async function getFiller(phrase: keyof typeof FIXED_PHRASES): Promise<Uint8Array> {
  const settings = voiceSettings();
  const key = fillerKey(phrase, settings.stockVoiceId, settings.ttsModel);
  const cache = state.familiarFiller ??= new Map();
  if (!cache.has(key)) {
    const pending = (async () => {
      const root = path.resolve("data/filler");
      const filename = path.join(root, `${key}.mp3`);
      try {
        const bytes = await readFile(filename);
        if (bytes.length >= 100 && bytes.length <= 256000) return new Uint8Array(bytes);
      } catch { /* A cache miss is normal. */ }
      const response = await streamSpeech(FIXED_PHRASES[phrase], "", AbortSignal.timeout(30000));
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 100 || bytes.length > 256000) throw new Error("Filler audio unavailable");
      try {
        await mkdir(root, { recursive: true });
        const temporary = `${filename}.tmp`;
        await writeFile(temporary, bytes);
        await rename(temporary, filename);
      } catch { /* Disk caching is optional; only fixed non-personal phrases are cached. */ }
      return bytes;
    })().catch((error: unknown) => { cache.delete(key); throw error; });
    cache.set(key, pending);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
  }
  return cache.get(key)!;
}
