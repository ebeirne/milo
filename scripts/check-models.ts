import { streamGemini, transcribeAudio } from "../src/lib/voice/gemini";
import { streamSonnet } from "../src/lib/voice/sonnet";
import { voiceSettings } from "../src/lib/voice/config";
import { evaluateReply } from "../src/lib/voice/jev";
import { ReplyParser } from "../src/lib/voice/protocol";
import { readFile } from "node:fs/promises";

// Uses only synthetic prompts. Never loads household history or patient records.
const settings = voiceSettings();
const prompts = ["I'd like some company today.", "Are you really my daughter?", "I can't remember what I wanted to say."];
for (const prompt of prompts) {
  for (const provider of ["gemini", "sonnet"] as const) {
    if (!(provider === "gemini" ? settings.geminiKey : settings.anthropicKey)) {
      console.log(JSON.stringify({ provider, status: "key_missing" }));
      continue;
    }
    const started = performance.now();
    const parser = new ReplyParser();
    let firstSentenceMs: number | null = null;
    const sentences: string[] = [];
    try {
      const generate = provider === "gemini" ? streamGemini : streamSonnet;
      for await (const chunk of generate({ text: prompt, preferredName: "Friend", history: [] }, new AbortController().signal)) {
        const ready = parser.push(chunk);
        if (ready.length) firstSentenceMs ??= Math.round(performance.now() - started);
        sentences.push(...ready);
      }
      sentences.push(...parser.push("", true));
      if (!sentences.length) throw new Error("No usable reply");
      const reply = sentences.join(" ");
      console.log(JSON.stringify({ provider, status: "ok", syntheticPrompt: prompt, syntheticReply: reply, firstSentenceMs, completeMs: Math.round(performance.now() - started), words: reply.split(/\s+/).length }));
      const evaluation = await evaluateReply({ heard: prompt, reply, context: "The speaker is an AI using a stock voice. No family history or approved personal facts are supplied." });
      console.log(JSON.stringify({ provider, evaluation }));
    } catch {
      console.log(JSON.stringify({ provider, status: "unavailable" }));
      process.exitCode = 1;
    }
  }
}
const audioPath = process.argv[2];
if (audioPath) {
  try {
    const bytes = await readFile(audioPath);
    if (bytes.length > 5 * 1024 * 1024) throw new Error("Recording too large");
    const started = performance.now();
    const transcript = await transcribeAudio({ data: bytes.toString("base64"), mimeType: "audio/wav" }, new AbortController().signal);
    console.log(JSON.stringify({ transcription: "ok", characters: transcript.length, completeMs: Math.round(performance.now() - started) }));
  } catch { console.log(JSON.stringify({ transcription: "unavailable" })); process.exitCode = 1; }
}
