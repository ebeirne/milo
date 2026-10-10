import assert from "node:assert/strict";
import { test } from "node:test";
import { assess, confirmsHelp, higherTier, screenText, type Tier } from "../src/lib/safety";
import { isDue, parseDays, parseLocalNow, parseTime, spokenLines } from "../src/lib/schedule";
import { parseSummary } from "../src/lib/voice/summary";
import { spendSpeechBudget } from "../src/lib/voice/elevenlabs";
import { conversationStream } from "../src/lib/voice/conversation-stream";
import { ReplyParser, readSse, type ConversationEvent } from "../src/lib/voice/protocol";
import { stockPrompt } from "../src/lib/voice/gemini";

test("safety phrases map to the expected tier, and reassuring sentences raise nothing", () => {
  const cases: [string, Tier | null][] = [
    ["I can't breathe properly", "emergency"],
    ["There's a pain in my chest", "emergency"],
    ["I think I'm having a stroke", "emergency"],
    ["Please call an ambulance", "emergency"],
    ["I just want to die", "emergency"],
    ["I don't want to be here anymore", "emergency"],
    ["I fell in the kitchen", "possible_emergency"],
    ["I've fallen and I'm on the floor", "possible_emergency"],
    ["My leg really hurts", "possible_emergency"],
    ["I am not sure but my leg hurts", "possible_emergency"],
    ["I don't know where I am", "possible_emergency"],
    ["Help me", "possible_emergency"],
    ["I feel dizzy", "possible_emergency"],
    ["I smell gas", "possible_emergency"],
    ["I didn't take my pills this morning", "concern"],
    ["I'm so lonely today", "concern"],
    ["I'm scared", "concern"],
    ["I can't remember what day it is", "concern"],
    ["My hip doesn't hurt anymore", null],
    ["It doesn't hurt", null],
    ["I'm not scared", null],
    ["I never feel lonely here", null],
    ["I took my pills this morning", null],
    ["The roses are lovely today", null],
    ["I had tea with Maria", null],
  ];
  for (const [text, tier] of cases) assert.equal(screenText(text)?.tier ?? null, tier, text);
  assert.equal(screenText("I just want to die")?.kind, "self_harm");
  assert.equal(screenText("I fell and I can't breathe")?.tier, "emergency", "the highest tier wins");
  assert.doesNotMatch(screenText("My leg really hurts")!.reason, /leg/, "reasons are categories, not the person's words");
});

test("either the screen or the model's label can escalate, and a yes confirms a pending question", () => {
  assert.equal(assess("The roses are lovely", null), null);
  assert.equal(assess("The roses are lovely", "concern")?.tier, "concern");
  assert.equal(assess("I fell", "concern")?.tier, "possible_emergency", "a lower model label never lowers the screen");
  assert.equal(assess("Something is wrong", "emergency")?.tier, "emergency");
  assert.equal(assess("Yes please", null, true)?.tier, "emergency");
  assert.equal(assess("Yes please", null, false), null, "a yes means nothing unless help was just offered");
  assert.equal(assess("No, I'm fine", null, true), null);
  assert(confirmsHelp("yeah") && !confirmsHelp("yes I'm okay") && !confirmsHelp("the garden"));
  assert.equal(higherTier("concern", "emergency"), "emergency");
  const parser = new ReplyParser();
  assert.deepEqual(parser.push("Do you need help right now? [[flag:possible_emergency]] [[flag:made_up]]", true), ["Do you need help right now?"]);
  assert.equal(parser.flag, "possible_emergency");
  assert.match(stockPrompt("Liz", false), /Do you need help right now\?.*\[\[flag:possible_emergency\]\]/);
  assert.match(stockPrompt("Liz", false), /Do not claim you can call anyone/);
});

test("the stream shows the help prompt before the reply, escalates on the model's label, and keeps concerns off the screen", async () => {
  const run = async (text: string, reply: string, fail = false) => {
    const body = conversationStream({ conversationId: "test", text, startedAt: performance.now() }, new AbortController().signal, {
      async *reply() { if (fail) throw new Error("provider down"); yield reply; },
      async save() {},
      async assess(heard, modelTier) { const safety = assess(heard, modelTier); return safety && { tier: safety.tier, kind: safety.kind }; },
      release() {},
    });
    const events: ConversationEvent[] = [];
    for await (const data of readSse(body)) events.push(JSON.parse(data));
    return events;
  };
  const fall = await run("I fell in the kitchen", "Do you need help right now? [[flag:possible_emergency]]");
  assert.deepEqual(fall.filter((event) => event.type === "safety"), [{ type: "safety", tier: "possible_emergency", kind: "general" }]);
  assert(fall.findIndex((event) => event.type === "safety") < fall.findIndex((event) => event.type === "sentence"));
  const escalated = await run("Something is very wrong", "Please press the Call 911 button on the screen. [[flag:emergency]]");
  assert.deepEqual(escalated.filter((event) => event.type === "safety"), [{ type: "safety", tier: "emergency", kind: "general" }]);
  assert.deepEqual((await run("I'm so lonely", "I'm here with you. [[flag:concern]]")).filter((event) => event.type === "safety"), []);
  const outage = await run("I can't breathe", "", true);
  assert.deepEqual(outage.filter((event) => event.type === "safety"), [{ type: "safety", tier: "emergency", kind: "general" }], "the call button does not depend on the model");
});

test("schedules come due once inside their window, on the device's own clock", () => {
  const pills = { time: "09:00", days: [1, 2, 3, 4, 5] };
  const at = (time: string, day = 1) => parseLocalNow(new URLSearchParams({ date: "2026-10-12", time, day: String(day) }))!;
  assert.equal(isDue(pills, at("08:59")), false);
  assert.equal(isDue(pills, at("09:00")), true);
  assert.equal(isDue(pills, at("10:00")), true);
  assert.equal(isDue(pills, at("10:01")), false);
  assert.equal(isDue(pills, at("09:30", 0)), false);
  assert.equal(parseLocalNow(new URLSearchParams({ date: "2026-10-12", time: "25:00", day: "1" })), null);
  assert.equal(parseLocalNow(new URLSearchParams({ date: "today", time: "09:00", day: "1" })), null);
  assert.equal(parseTime("9:00"), null);
  assert.deepEqual(parseDays([3, 1]), [1, 3]);
  assert.equal(parseDays([]), null);
  assert.equal(parseDays([1, 1]), null);
  assert.equal(parseDays([7]), null);
  assert.deepEqual(spokenLines("reminder", "Time for your pills", "Liz", "Mike"), ["Hello Liz. This is the AI voice of Mike.", "Here is a reminder. Time for your pills."]);
  assert.deepEqual(spokenLines("checkin", "How are you feeling today?", "Liz", null), ["Hello Liz. This is Familiar.", "How are you feeling today?"]);
});

test("summaries are validated before the family sees them, and speech stops at the daily cap", () => {
  assert.deepEqual(parseSummary('Here you go: {"summary": "They talked about the garden  and seemed content.", "mood": "calm"}'), { summary: "They talked about the garden and seemed content.", mood: "calm" });
  assert.equal(parseSummary('{"summary": "Fine.", "mood": "ecstatic"}'), null);
  assert.equal(parseSummary('{"summary": "", "mood": "calm"}'), null);
  assert.equal(parseSummary("They talked about the garden."), null);
  spendSpeechBudget(60, 100, "2099-01-01");
  assert.throws(() => spendSpeechBudget(60, 100, "2099-01-01"), /Daily speech limit/);
  spendSpeechBudget(40, 100, "2099-01-01");
  spendSpeechBudget(60, 100, "2099-01-02");
});
