import assert from "node:assert/strict";
import { test } from "node:test";
import { audioMime, cleanSpeech, ReplyParser, readSse } from "../src/lib/voice/protocol";
import { speechTicket, readSpeechTicket } from "../src/lib/voice/tickets";
import { fillerKey, streamSpeech } from "../src/lib/voice/elevenlabs";
import { streamGemini, stockPrompt } from "../src/lib/voice/gemini";
import { boundedBody, sameOrigin } from "../src/lib/voice/request";
import { DEFAULT_STOCK_VOICE_ID } from "../src/lib/voice/config";

test("fragmented control labels and transcription never reach speech", () => {
  const parser = new ReplyParser();
  const sentences = [
    ...parser.push("[[hea"), ...parser.push("rd: I went outside.]] [[mood:ha"),
    ...parser.push("ppy]] That sounds lovely. What did "), ...parser.push("you notice? [[remember: unapproved fact]]"),
    ...parser.push("", true),
  ];
  assert.equal(parser.transcript, "I went outside.");
  assert.deepEqual(sentences, ["That sounds lovely.", "What did you notice?"]);
});

test("only two sentences are emitted and incomplete labels are discarded", () => {
  const parser = new ReplyParser();
  assert.deepEqual(parser.push("Hello. How are you? This must not be spoken. [[flag:emerg", true), ["Hello.", "How are you?"]);
  assert.equal(cleanSpeech("[warmly] **Hello.** [[mood:calm]]"), "Hello.");
});

test("SSE parsing handles split UTF-8, CRLF, multiline data, and final events", async () => {
  const bytes = new TextEncoder().encode(": keepalive\r\ndata: café\r\ndata: deuxième\r\n\r\ndata: last");
  const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const results: string[] = [];
  for await (const event of readSse(body)) results.push(event);
  assert.deepEqual(results, ["café\ndeuxième", "last"]);
});

test("Safari M4A and Chromium Opus recordings normalize to provider MIME types", () => {
  assert.equal(audioMime("audio/mp4"), "audio/m4a");
  assert.equal(audioMime("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(audioMime("audio/ogg;codecs=opus"), "audio/ogg");
  assert.equal(audioMime("application/octet-stream"), null);
});

test("speech tickets reject changes to the server-issued text and expired requests", () => {
  const ticket = speechTicket("Hello.", "One moment.");
  assert.deepEqual(readSpeechTicket(ticket), { text: "Hello.", previousText: "One moment.", voiceId: null });
  const [payload, signature] = ticket.split(".");
  const changed = Buffer.from(JSON.stringify({ text: "Say something else", previousText: "", expires: Date.now() + 10000 })).toString("base64url");
  assert.equal(readSpeechTicket(`${changed}.${signature}`), null);
  assert.equal(readSpeechTicket(`${payload}.short`), null);
  const realNow = Date.now;
  Date.now = () => realNow() + 130000;
  try { assert.equal(readSpeechTicket(ticket), null); } finally { Date.now = realNow; }
});

test("fixed phrase cache keys distinguish voice, model, and text", () => {
  const key = fillerKey("thinking", "voice-a", "model-a");
  assert.notEqual(key, fillerKey("thinking", "voice-b", "model-a"));
  assert.notEqual(key, fillerKey("thinking", "voice-a", "model-b"));
  assert.notEqual(key, fillerKey("disclosure", "voice-a", "model-a"));
});

test("provider input uses direct audio and credentials in headers; thinking text is excluded", async () => {
  process.env.GEMINI_API_KEY = "test-key-gemini";
  const chunks: string[] = [];
  for await (const chunk of streamGemini({ preferredName: "Liz", history: [], audio: { data: "YXVkaW8=", mimeType: "audio/webm" } }, new AbortController().signal, async (url, options) => {
    assert(!url.includes("test-key"));
    assert.equal(options.headers["x-goog-api-key"], "test-key-gemini");
    const body = JSON.parse(options.body! as string);
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, "audio/webm");
    assert.equal(body.contents[0].parts.length, 1, "Helper instructions must stay out of the patient's audio turn");
    return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Private thought", thought: true }, { text: "Hello." }] } }] })}\n\n`);
  })) chunks.push(chunk);
  assert.deepEqual(chunks, ["Hello."]);
  assert.match(stockPrompt("Liz", true), /stock AI voice/);
  assert.match(stockPrompt("Liz", true), /Never invent shared memories/);
});

test("streaming TTS passes previous_text, strips controls, and requires a premade voice", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key-elevenlabs";
  process.env.ELEVENLABS_STOCK_VOICE_ID = "test-stock";
  let calls = 0;
  const response = await streamSpeech("Hello. [[mood:calm]]", "One moment.", new AbortController().signal, async (url, options) => {
    calls++;
    assert.equal(options.headers["xi-api-key"], "test-key-elevenlabs");
    if (url.includes("/voices/")) return Response.json({ category: "premade" });
    assert(url.includes("/stream?output_format=mp3_44100_128"));
    const body = JSON.parse(options.body! as string);
    assert.equal(body.text, "Hello.");
    assert.equal(body.previous_text, "One moment.");
    return new Response(new Uint8Array([1, 2, 3]));
  });
  assert.equal(calls, 2);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));
  process.env.ELEVENLABS_STOCK_VOICE_ID = "test-unconsented";
  await assert.rejects(streamSpeech("Hello.", "", new AbortController().signal, async () => Response.json({ category: "cloned" })), /stock voice/);
});

test("the pinned provider stock voice works with TTS permission alone", async () => {
  process.env.ELEVENLABS_API_KEY = "test-key-tts-only";
  process.env.ELEVENLABS_STOCK_VOICE_ID = DEFAULT_STOCK_VOICE_ID;
  let calls = 0;
  const response = await streamSpeech("Hello.", "", new AbortController().signal, async (url, options) => {
    calls++;
    assert.equal(options.method, "POST");
    assert(url.includes(`/text-to-speech/${DEFAULT_STOCK_VOICE_ID}/stream`));
    assert(!url.includes("/voices/"), "The built-in stock voice must not require voice-library access");
    return new Response(new Uint8Array([1, 2, 3]));
  });
  assert.equal(calls, 1);
  assert.equal((await response.arrayBuffer()).byteLength, 3);
});

test("cross-origin and oversized requests are rejected", async () => {
  assert.equal(sameOrigin(new Request("http://localhost/api/converse", { headers: { origin: "http://other.invalid" } })), false);
  assert.equal(sameOrigin(new Request("http://localhost/api/converse", { headers: { origin: "http://localhost" } })), true);
  assert.equal(sameOrigin(new Request("http://localhost/api/converse", { headers: { origin: "https://demo.example.com", "x-forwarded-host": "demo.example.com" } })), true);
  assert.equal(sameOrigin(new Request("http://localhost/api/converse", { headers: { origin: "https://other.example.com", "x-forwarded-host": "demo.example.com" } })), false);
  await assert.rejects(boundedBody(new Request("http://localhost", { method: "POST", body: "too much data" }), 3), /too large/);
});

test("provider failures return sanitized errors without key or payload details", async () => {
  process.env.GEMINI_API_KEY = "private-test-key";
  await assert.rejects(async () => {
    for await (const chunk of streamGemini({ text: "Private input", preferredName: "Liz", history: [] }, new AbortController().signal, async () => new Response("private-test-key: Private input", { status: 429 }))) void chunk;
  }, (error: unknown) => error instanceof Error && error.message === "Conversation provider unavailable");
});
