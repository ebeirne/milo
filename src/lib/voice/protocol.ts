export type ConversationEvent =
  | { type: "start"; conversationId: string }
  | { type: "transcript"; text: string }
  | { type: "sentence"; text: string; ticket: string }
  | { type: "timings"; firstPhraseMs: number }
  | { type: "error"; message: string }
  | { type: "done" };

export type VoiceConfig = {
  ready: boolean;
  reason?: "setup" | "database" | "providers";
  preferredName?: string;
  label: string;
};

export const STOCK_VOICE_LABEL = "AI stock voice · not a family member’s voice";
export const FIXED_PHRASES = {
  thinking: "One moment.",
  disclosure: "I'm Familiar, an AI companion. This is a stock AI voice, not your family member's voice.",
} as const;

// Handles SSE even when UTF-8 characters, lines, and events cross network chunks.
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let data: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (!line) {
          if (data.length) yield data.join("\n");
          data = [];
        } else if (line.startsWith("data:")) {
          data.push(line.slice(5).replace(/^ /, ""));
        }
      }
      if (pending.length > 128000) throw new Error("Stream event is too large");
      if (done) break;
    }
    if (pending.startsWith("data:")) data.push(pending.slice(5).trimStart());
    if (data.length) yield data.join("\n");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function cleanSpeech(text: string): string {
  return text.replace(/\[\[[\s\S]*?(?:\]\]|$)/g, "")
    .replace(/\[(?:laughs|chuckles|sighs|softly|warmly)\]/gi, "")
    .replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
}

export class ReplyParser {
  private pending = "";
  private speech = "";
  private count = 0;
  transcript = "";

  push(chunk: string, final = false): string[] {
    this.pending += chunk;
    if (this.pending.length > 8000) throw new Error("Reply is too large");
    while (this.pending) {
      if (this.pending.startsWith("[[")) {
        const end = this.pending.indexOf("]]");
        if (end === -1) {
          if (final) this.pending = "";
          break;
        }
        const label = this.pending.slice(2, end);
        if (label.startsWith("heard:")) this.transcript = label.slice(6).trim().slice(0, 2000);
        this.pending = this.pending.slice(end + 2);
      } else if (this.pending === "[" && !final) {
        break;
      } else {
        const next = this.pending.indexOf("[[", 1);
        let end = next === -1 ? this.pending.length : next;
        if (!final && next === -1 && this.pending.endsWith("[")) end--;
        if (!end) break;
        this.speech += this.pending.slice(0, end);
        this.pending = this.pending.slice(end);
      }
    }
    const sentences: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = /[.!?]+["”']?(?=\s|$)/.exec(this.speech))) {
      const end = match.index + match[0].length;
      const text = cleanSpeech(this.speech.slice(0, end)).slice(0, 500);
      this.speech = this.speech.slice(end).trimStart();
      if (text && this.count++ < 2) sentences.push(text);
    }
    if (final) {
      const text = cleanSpeech(this.speech).slice(0, 500);
      if (text && this.count++ < 2) sentences.push(text);
      this.speech = "";
    }
    return sentences;
  }
}

export function audioMime(type: string): string | null {
  const base = type.toLowerCase().split(";")[0].trim();
  if (base === "audio/mp4" || base === "video/mp4" || base === "audio/x-m4a") return "audio/m4a";
  if (base === "audio/x-wav") return "audio/wav";
  return ["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp3", "audio/m4a", "audio/aac"].includes(base) ? base : null;
}
