import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationStream } from "../src/lib/voice/conversation-stream";
import { readSse, type ConversationEvent } from "../src/lib/voice/protocol";
import { readSpeechTicket } from "../src/lib/voice/tickets";

test("audio transcript and spoken replies persist together, with contextual speech tickets", async () => {
  let saved: string[] = [];
  let releases = 0;
  const body = conversationStream({ conversationId: "test", startedAt: performance.now() }, new AbortController().signal, {
    async *reply() {
      yield "[[heard: I saw a bird.]] [[mood:happy]] That sounds nice.";
      yield " What color was it? [[remember: unapproved fact]]";
    },
    async save(heard, reply) { saved = [heard, reply]; },
    release() { releases++; },
  });
  const events: ConversationEvent[] = [];
  for await (const data of readSse(body)) events.push(JSON.parse(data));
  assert.equal(events[0].type, "start");
  assert.deepEqual(events.find((event) => event.type === "transcript"), { type: "transcript", text: "I saw a bird." });
  const sentences = events.filter((event) => event.type === "sentence");
  assert.deepEqual(sentences.map((event) => event.text), ["That sounds nice.", "What color was it?"]);
  assert.equal(readSpeechTicket(sentences[1].ticket)?.previousText, "That sounds nice. ");
  assert.deepEqual(saved, ["I saw a bird.", "That sounds nice. What color was it?"]);
  assert.equal(events.at(-1)?.type, "done");
  assert.equal(releases, 1);
});

test("reader cancellation aborts the model and prevents storing an interrupted turn", async () => {
  let saves = 0;
  let aborted = false;
  let resolveRelease!: () => void;
  const released = new Promise<void>((resolve) => { resolveRelease = resolve; });
  const body = conversationStream({ conversationId: "test", text: "hello", startedAt: performance.now() }, new AbortController().signal, {
    async *reply(signal) {
      await new Promise<void>((_resolve, reject) => {
        const cancel = () => { aborted = true; reject(new Error("Stopped")); };
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) cancel();
      });
      yield "This must not play.";
    },
    async save() { saves++; },
    release() { resolveRelease(); },
  });
  const reader = body.getReader();
  await reader.read();
  await reader.cancel();
  await released;
  assert.equal(aborted, true);
  assert.equal(saves, 0);
});

test("model failure gives a safe caption and speech fallback without exposing provider errors", async () => {
  const body = conversationStream({ conversationId: "test", text: "hello", startedAt: performance.now() }, new AbortController().signal, {
    async *reply() { yield ""; throw new Error("SECRET_KEY and private speech"); },
    async save() { assert.fail("Failed turns must not persist"); },
    release() {},
  });
  const events: ConversationEvent[] = [];
  for await (const data of readSse(body)) events.push(JSON.parse(data));
  assert.equal(events.filter((event) => event.type === "sentence").length, 1);
  assert(events.some((event) => event.type === "error"));
  assert(!JSON.stringify(events).includes("SECRET_KEY"));
  assert.equal(events.at(-1)?.type, "done");
});
