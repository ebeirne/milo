import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function wave(seconds: number, frequency = 220): Buffer {
  const sampleRate = 16000;
  const samples = Math.floor(sampleRate * seconds);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * frequency / sampleRate) * 1500), 44 + i * 2);
  return bytes;
}

async function prepare(page: Page, fillerSeconds = 0.15) {
  await page.addInitScript(() => {
    const audit = { starts: [] as { duration: number; time: number }[], stops: 0, tracks: [] as MediaStreamTrack[] };
    (window as unknown as { familiarAudioAudit: typeof audit }).familiarAudioAudit = audit;
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<AudioBufferSourceNode["start"]>) {
      audit.starts.push({ duration: this.buffer?.duration ?? 0, time: args[0] ?? 0 });
      return originalStart.apply(this, args);
    };
    const originalStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args: Parameters<AudioBufferSourceNode["stop"]>) {
      audit.stops++;
      return originalStop.apply(this, args);
    };
    const originalMic = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await originalMic(constraints);
      audit.tracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.route("**/api/voice-config", (route) => route.fulfill({ json: { ready: true, preferredName: "Liz", label: "AI stock voice" } }));
  await page.route("**/api/filler?*", (route) => route.fulfill({ contentType: "audio/wav", body: wave(fillerSeconds) }));
  await page.goto("/talk?debug=1");
  await expect(page.getByRole("button", { name: "Talk", exact: true })).toBeEnabled();
  // Wait for both fixed phrases before starting the latency measurement.
  await page.waitForLoadState("networkidle");
}

function eventStream(events: object[]) { return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""); }

test("typed replies play in sentence order, with accessible controls and measured timings", async ({ page }, testInfo) => {
  let sentText = false;
  await page.route("**/api/converse", async (route) => {
    sentText = route.request().postDataBuffer()?.includes(Buffer.from("Hello there")) ?? false;
    await route.fulfill({ contentType: "text/event-stream", body: eventStream([
      { type: "start", conversationId: "00000000-0000-4000-8000-000000000001" },
      { type: "sentence", text: "Hello, Liz.", ticket: "first" },
      { type: "sentence", text: "How is your day?", ticket: "second" },
      { type: "timings", firstPhraseMs: 75 }, { type: "done" },
    ]) });
  });
  await page.route("**/api/tts", async (route) => {
    const first = route.request().postDataJSON().ticket === "first";
    if (first) await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ contentType: "audio/wav", body: wave(first ? 0.4 : 0.6, first ? 220 : 440) });
  });
  await prepare(page);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.getByText("Prefer to type?", { exact: true }).click();
  await page.getByLabel("Your message", { exact: true }).fill("Hello there");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Hello, Liz. How is your day?", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk", exact: true })).toBeEnabled();
  expect(sentText).toBe(true);
  const starts = await page.evaluate(() => (window as unknown as { familiarAudioAudit: { starts: { duration: number; time: number }[] } }).familiarAudioAudit.starts);
  expect(starts.map((start) => Math.round(start.duration * 100))).toEqual([15, 40, 60]);
  expect(starts[2].time - (starts[1].time + starts[1].duration)).toBeLessThan(0.01);
  const firstAudio = Number((await page.locator(".latency-panel dl > div").filter({ hasText: "First audio (includes filler)" }).locator("dd").innerText()).replace(" ms", ""));
  expect(firstAudio).toBeLessThan(1500);
  await page.screenshot({ path: `.verification/talk-${testInfo.project.name}.png`, fullPage: true });
});

test("Stop silences active audio immediately and late synthesis cannot restart it", async ({ page }) => {
  await page.route("**/api/converse", (route) => route.fulfill({ contentType: "text/event-stream", body: eventStream([
    { type: "sentence", text: "A delayed reply.", ticket: "late" }, { type: "done" },
  ]) }));
  await page.route("**/api/tts", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ contentType: "audio/wav", body: wave(2) }).catch(() => {});
  });
  await prepare(page, 4);
  await page.getByText("Prefer to type?", { exact: true }).click();
  await page.getByLabel("Your message", { exact: true }).fill("Hello");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("You can stop my voice");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Talk", exact: true })).toBeEnabled();
  const stopMs = Number((await page.locator(".latency-panel dl > div").filter({ hasText: "Stop handler" }).locator("dd").innerText()).replace(" ms", ""));
  expect(stopMs).toBeLessThan(300);
  // Let the intentionally delayed provider settle, then inspect playback sources.
  await page.waitForTimeout(1000);
  const audit = await page.evaluate(() => (window as unknown as { familiarAudioAudit: { starts: unknown[]; stops: number } }).familiarAudioAudit);
  expect(audit.starts.length).toBe(1);
  expect(audit.stops).toBe(1);
});

test("tap-to-talk releases microphone tracks and sends a recorded audio blob", async ({ page }) => {
  let audioReceived = false;
  await page.route("**/api/converse", async (route) => {
    const body = route.request().postDataBuffer();
    audioReceived = Boolean(body && body.length > 100 && body.includes(Buffer.from('name="audio"')));
    await route.fulfill({ contentType: "text/event-stream", body: eventStream([
      { type: "transcript", text: "Hello from a microphone." },
      { type: "sentence", text: "Hello. I’m glad you’re here.", ticket: "audio" }, { type: "done" },
    ]) });
  });
  await page.route("**/api/tts", (route) => route.fulfill({ contentType: "audio/wav", body: wave(0.2) }));
  await prepare(page);
  await page.getByRole("button", { name: "Talk", exact: true }).click();
  await expect(page.getByRole("button", { name: "Finish speaking" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Finish speaking" }).click();
  await expect(page.getByText("Hello. I’m glad you’re here.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk", exact: true })).toBeEnabled();
  expect(audioReceived).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { familiarAudioAudit: { tracks: MediaStreamTrack[] } }).familiarAudioAudit.tracks.every((track) => track.readyState === "ended"))).toBe(true);
});

test("microphone denial offers typing, and failed TTS keeps a visible reply", async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); }; });
  await page.getByRole("button", { name: "Talk", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your microphone is turned off" })).toBeVisible();
  await page.route("**/api/converse", (route) => route.fulfill({ contentType: "text/event-stream", body: eventStream([
    { type: "sentence", text: "You can read this reply.", ticket: "failed" }, { type: "done" },
  ]) }));
  await page.route("**/api/tts", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.getByText("Prefer to type?", { exact: true }).click();
  await page.getByLabel("Your message", { exact: true }).fill("Hello");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("You can read this reply.", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "I couldn’t play my voice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk", exact: true })).toBeEnabled();
});

test("API boundaries reject invalid speech tickets, empty recordings, and foreign origins", async ({ request }) => {
  expect((await request.post("/api/tts", { data: { ticket: "forged" } })).status()).toBe(400);
  expect((await request.post("/api/converse", { multipart: { text: "" } })).status()).toBe(400);
  expect((await request.post("/api/converse", { headers: { Origin: "https://other.invalid" }, multipart: { text: "hello" } })).status()).toBe(403);
});
