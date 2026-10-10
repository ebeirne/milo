import "server-only";
import { voiceSettings } from "./config";
import { stockPrompt, type GeminiInput } from "./gemini";
import { providerFetch } from "./provider-fetch";
import { readSse } from "./protocol";

export async function* streamSonnet(input: GeminiInput & { text: string }, signal: AbortSignal, fetchProvider: typeof providerFetch = providerFetch): AsyncGenerator<string> {
  const settings = voiceSettings();
  if (!settings.anthropicKey) throw new Error("Sonnet is not configured");
  const response = await fetchProvider("https://api.anthropic.com/v1/messages", {
    method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    headers: { "x-api-key": settings.anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.sonnetModel, max_tokens: 384, stream: true,
      thinking: { type: "between_tools" }, output_config: { effort: "low" },
      system: stockPrompt(input.preferredName, false),
      messages: [...input.history.map((turn) => ({ role: turn.role, content: turn.text })), { role: "user", content: input.text }],
    }),
  });
  if (!response.ok || !response.body) throw new Error("Sonnet is unavailable");
  let length = 0;
  let finished = false;
  for await (const data of readSse(response.body)) {
    signal.throwIfAborted();
    const event = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string; stop_reason?: string } };
    if (event.type === "error") throw new Error("Sonnet is unavailable");
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
      length += event.delta.text.length;
      if (length > 8000) throw new Error("Reply is too large");
      yield event.delta.text;
    }
    if (event.type === "message_delta" && event.delta?.stop_reason && event.delta.stop_reason !== "end_turn") throw new Error("Sonnet reply was incomplete");
    if (event.type === "message_stop") finished = true;
  }
  if (!finished || !length) throw new Error("Sonnet reply was incomplete");
}
