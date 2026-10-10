import "server-only";
import { activeConversationProvider, voiceSettings } from "./config";
import { streamGemini, transcribeAudio, type GeminiInput } from "./gemini";
import { streamSonnet } from "./sonnet";

export type ModelNotice = { provider: "sonnet" | "gemini"; fallback: boolean };

export async function* streamConversation(input: GeminiInput, signal: AbortSignal, notice: (model: ModelNotice) => void, dependencies = {
  sonnet: streamSonnet, gemini: streamGemini, transcribe: transcribeAudio,
}): AsyncGenerator<string> {
  if (activeConversationProvider() === "gemini") {
    notice({ provider: "gemini", fallback: voiceSettings().conversationProvider === "sonnet" });
    yield* dependencies.gemini(input, signal);
    return;
  }
  const text = input.audio ? await dependencies.transcribe(input.audio, signal) : input.text?.trim() ?? "";
  signal.throwIfAborted();
  if (input.audio) yield `[[heard: ${text.replace(/\[\[|\]\]/g, "")}]]`;
  if (!text) { yield "I couldn’t hear your words clearly. Would you like to try again?"; return; }
  let emitted = false;
  notice({ provider: "sonnet", fallback: false });
  try {
    for await (const token of dependencies.sonnet({ ...input, audio: undefined, text }, signal)) {
      if (token) emitted = true;
      yield token;
    }
  } catch (error) {
    // Do not splice another model into a reply that has already started.
    if (signal.aborted || emitted || !voiceSettings().geminiKey) throw error;
    notice({ provider: "gemini", fallback: true });
    yield* dependencies.gemini({ ...input, audio: undefined, text }, signal);
  }
}
