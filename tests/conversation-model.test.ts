import assert from "node:assert/strict";
import { test } from "node:test";
import { streamSonnet } from "../src/lib/voice/sonnet";
import { transcribeAudio } from "../src/lib/voice/gemini";
import { streamConversation } from "../src/lib/voice/conversation-model";
import { evaluateReply, parseJudgments, REVIEW_CHECKS } from "../src/lib/voice/jev";

test("Sonnet streams only text, uses current low-latency settings, and keeps credentials in headers", async () => {
  process.env.ANTHROPIC_API_KEY = "test-anthropic-secret";
  const tokens: string[] = [];
  for await (const token of streamSonnet({ text: "hello", preferredName: "Liz", history: [] }, new AbortController().signal, async (url, options) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(options.headers["x-api-key"], "test-anthropic-secret");
    const body = JSON.parse(options.body! as string);
    assert.equal(body.model, "claude-sonnet-5-5");
    assert.deepEqual(body.thinking, { type: "between_tools" });
    assert.equal(body.output_config.effort, "low");
    assert(!("temperature" in body));
    return new Response([
      { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "Do not expose" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "Hello." } },
      { type: "message_delta", delta: { stop_reason: "end_turn" } }, { type: "message_stop" },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
  })) tokens.push(token);
  assert.deepEqual(tokens, ["Hello."]);
});

test("Gemini transcription contains audio only and returns exact words without generating a reply", async () => {
  process.env.GEMINI_API_KEY = "test-gemini-secret";
  const transcript = await transcribeAudio({ data: "YXVkaW8=", mimeType: "audio/wav" }, new AbortController().signal, async (_url, options) => {
    const body = JSON.parse(options.body! as string);
    assert.equal(body.contents[0].parts.length, 1);
    assert.equal(body.contents[0].parts[0].inlineData.mimeType, "audio/wav");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"transcript":"I saw a bird."}' }] } }] });
  });
  assert.equal(transcript, "I saw a bird.");
});

test("audio transcribes before Sonnet, and pre-output failure falls back without transcribing again", async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.GEMINI_API_KEY = "test-key";
  process.env.CONVERSATION_PROVIDER = "sonnet";
  let transcriptions = 0;
  const notices: unknown[] = [];
  const output: string[] = [];
  for await (const token of streamConversation({ preferredName: "Liz", history: [], audio: { data: "audio", mimeType: "audio/wav" } }, new AbortController().signal, (notice) => notices.push(notice), {
    async transcribe() { transcriptions++; return "hello"; },
    async *sonnet(input) { assert.equal(input.text, "hello"); assert.equal(input.audio, undefined); yield ""; throw new Error("Unavailable"); },
    async *gemini(input) { assert.equal(input.audio, undefined); assert.equal(input.text, "hello"); yield "A fallback reply."; },
  })) output.push(token);
  assert.deepEqual(output, ["[[heard: hello]]", "", "A fallback reply."]);
  assert.equal(transcriptions, 1);
  assert.deepEqual(notices, [{ provider: "sonnet", fallback: false }, { provider: "gemini", fallback: true }]);
});

test("Sonnet interruption never splices a Gemini reply into partially emitted text", async () => {
  let fallback = false;
  await assert.rejects(async () => {
    for await (const token of streamConversation({ text: "hello", preferredName: "Liz", history: [] }, new AbortController().signal, () => {}, {
      async transcribe() { return "unused"; },
      async *sonnet() { yield "A partial"; throw new Error("Interrupted"); },
      async *gemini() { fallback = true; yield "different reply"; },
    })) void token;
  }, /Interrupted/);
  assert.equal(fallback, false);
});

test("missing Sonnet key preserves the existing Gemini audio conversation path", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const output: string[] = [];
  for await (const token of streamConversation({ preferredName: "Liz", history: [], audio: { data: "audio", mimeType: "audio/wav" } }, new AbortController().signal, () => {}, {
    async transcribe() { assert.fail("No extra STT hop for Gemini fallback"); },
    async *sonnet() { assert.fail("No key"); yield ""; },
    async *gemini(input) { assert(input.audio); yield "[[heard: hello]] Hello."; },
  })) output.push(token);
  assert.deepEqual(output, ["[[heard: hello]] Hello."]);
});

test("Jev sends four independent rubric questions and stores only validated judgments", async () => {
  process.env.TYPESAFE_API_KEY = "test-typesafe-secret";
  const answers = Object.fromEntries(REVIEW_CHECKS.map((check) => [check, { type: "choice", choice: "clear", confidence: 0.85, probabilities: { clear: 0.9, present: 0.05, uncertain: 0.05 } }]));
  const result = await evaluateReply({ heard: "hello", reply: "Hello.", context: "No approved personal facts." }, async (url, options) => {
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(options.headers.Authorization, "Bearer test-typesafe-secret");
    const body = JSON.parse(options.body! as string);
    assert.equal(Object.keys(body.questions).length, 4);
    for (const question of Object.values(body.questions) as { type: string }[]) assert.equal(question.type, "choice");
    return Response.json({ model: "jev-1.13.0", answers, extra: "not persisted" });
  });
  assert.equal(result.status, "completed");
  assert.equal(result.model, "jev-1.13.0");
  assert.equal(result.judgments.medical_advice?.choice, "clear");
  assert(!JSON.stringify(result).includes("not persisted"));
});

test("Jev missing key or invalid response is observable and never grants approval", async () => {
  delete process.env.TYPESAFE_API_KEY;
  assert.equal((await evaluateReply({ heard: "hi", reply: "hi", context: "" }, async () => { assert.fail("No key must not call provider"); })).status, "disabled");
  process.env.TYPESAFE_API_KEY = "test-key";
  assert.equal((await evaluateReply({ heard: "hi", reply: "hi", context: "" }, async () => Response.json({ answers: { medical_advice: { confidence: 1 } } }))).status, "unavailable");
  assert.throws(() => parseJudgments({}), /Invalid evaluation/);
});
