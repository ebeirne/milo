import "server-only";
import { providerFetch } from "./provider-fetch";
import { voiceSettings } from "./config";

export class CloneProviderError extends Error {
  constructor(public knownFailure: boolean) { super(knownFailure ? "Voice creation was not accepted. Check the ElevenLabs plan, voice slots, and Voices → Write permission, then try again." : "The provider’s result is uncertain. Check this request in ElevenLabs before trying again."); }
}

export async function createClone(name: string, sample: Uint8Array, fetchProvider: typeof providerFetch = providerFetch): Promise<{ voiceId: string; requiresVerification: boolean }> {
  const key = voiceSettings().elevenlabsKey;
  if (!key) throw new CloneProviderError(true);
  const form = new FormData();
  form.set("name", name);
  form.set("description", "Familiar AI voice recreation, recorded by the living voice owner with explicit consent.");
  form.append("files", new Blob([new Uint8Array(sample)], { type: "audio/mpeg" }), "sample.mp3");
  const encoded = new Request("https://api.elevenlabs.io/v1/voices/add", { method: "POST", body: form });
  let response: Response;
  try {
    response = await fetchProvider(encoded.url, { method: "POST", signal: AbortSignal.timeout(60000), headers: { "xi-api-key": key, "Content-Type": encoded.headers.get("content-type")! }, body: new Uint8Array(await encoded.arrayBuffer()) });
  } catch { throw new CloneProviderError(false); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new CloneProviderError(response.status >= 400 && response.status < 500); }
  try {
    const value = await response.json() as { voice_id?: string; requires_verification?: boolean };
    if (!value.voice_id || !/^[\w-]{1,100}$/.test(value.voice_id)) throw new Error("Invalid voice result");
    return { voiceId: value.voice_id, requiresVerification: value.requires_verification === true };
  } catch { throw new CloneProviderError(false); }
}

export async function deleteClone(voiceId: string, fetchProvider: typeof providerFetch = providerFetch): Promise<void> {
  const response = await fetchProvider(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", signal: AbortSignal.timeout(30000), headers: { "xi-api-key": voiceSettings().elevenlabsKey } });
  if (!response.ok && response.status !== 404) throw new Error("The voice could not be deleted from ElevenLabs. Check Voices → Write permission and try again.");
  await response.body?.cancel().catch(() => {});
}

export async function previewClone(voiceId: string, name: string, signal: AbortSignal, fetchProvider: typeof providerFetch = providerFetch): Promise<Response> {
  const settings = voiceSettings();
  const response = await fetchProvider(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`, {
    method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    headers: { "xi-api-key": settings.elevenlabsKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text: `This is an AI recreation of ${name}'s voice, made with their permission. Hello. This is a short voice preview.`, model_id: settings.ttsModel, voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.85 } }),
  });
  if (!response.ok || !response.body) throw new Error("The voice preview is unavailable. The provider may require verification first.");
  return response;
}
