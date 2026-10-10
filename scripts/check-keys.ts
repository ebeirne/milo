// Confirms each configured provider key works, with one cheap read-only call each. Prints no secrets.
//   node --env-file-if-exists=.env.local --import tsx scripts/check-keys.ts
const checks: [string, string | undefined, () => Promise<Response>][] = [
  ["ElevenLabs", process.env.ELEVENLABS_API_KEY, () => fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } })],
  ["Gemini", process.env.GEMINI_API_KEY, () => fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY! } })],
  ["TypeSafe", process.env.TYPESAFE_API_KEY, () => fetch("https://api.typesafe.ai/v1/models", { headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` } })],
];

for (const [name, key, call] of checks) {
  if (!key) { console.log(`${name}: no key`); continue; }
  try {
    const response = await call();
    const body = await response.json().catch(() => ({}));
    let detail = "";
    if (name === "Gemini" && response.ok) detail = (body.models ?? []).map((model: { name: string }) => model.name.replace("models/", "")).filter((id: string) => /image|imagen/.test(id)).join(", ");
    if (name === "ElevenLabs" && response.ok) detail = `${body.character_count}/${body.character_limit} characters used, voice slots ${body.voice_slots_used ?? "?"}/${body.voice_limit ?? "?"}`;
    console.log(`${name}: HTTP ${response.status}${detail ? ` · ${detail}` : ""}`);
  } catch (error) {
    console.log(`${name}: request failed (${error instanceof Error ? error.message : "unknown"})`);
  }
}

export {};
