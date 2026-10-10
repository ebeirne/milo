import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const token = "A".repeat(43);
const voice = { id: "00000000-0000-4000-8000-000000000001", display_name: "Sarah", relationship: "Daughter", cloning_status: "ready", consent_recorded_at: "2026-10-10T12:00:00Z", created_at: "2026-10-10T12:00:00Z", active: false, persona: { how_they_talk: "", pet_names: [], humor: "", shared_facts: [], never_claim: [] } };

async function fakeRecorder(page: Page) {
  await page.addInitScript(() => {
    class TestRecorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/wav";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        if (this.state !== "recording") return;
        this.state = "inactive";
        const samples = 16000;
        const bytes = new Uint8Array(44 + samples * 2);
        const data = new DataView(bytes.buffer);
        const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
        text(0, "RIFF"); data.setUint32(4, bytes.length - 8, true); text(8, "WAVEfmt ");
        data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
        data.setUint32(24, 16000, true); data.setUint32(28, 32000, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
        text(36, "data"); data.setUint32(40, samples * 2, true);
        this.ondataavailable?.({ data: new Blob([bytes], { type: "audio/wav" }) });
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaRecorder", { value: TestRecorder });
  });
  await page.clock.install();
}

test("remote owner must record consent and a full sample before enrollment; preview is labeled", async ({ page }, testInfo) => {
  await fakeRecorder(page);
  await page.route(`**/api/record-links/${token}`, (route) => route.fulfill({ json: { name: "Sarah", relationship: "Daughter", submissionId: voice.id, expiresAt: "2026-10-11T12:00:00Z" } }));
  let submitted = false;
  await page.route("**/api/voices", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-familiar-record-token"]).toBe(token);
    const data = route.request().postDataBuffer()!;
    expect(data.includes(Buffer.from('name="consent"'))).toBe(true);
    expect(data.includes(Buffer.from('name="sample"'))).toBe(true);
    submitted = true;
    await route.fulfill({ status: 201, json: { voice } });
  });
  await page.route(`**/api/voices/${voice.id}/preview`, (route) => route.fulfill({ contentType: "audio/mpeg", body: Buffer.alloc(2000) }));
  await page.goto(`/r/${token}`);
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("Sarah");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Continue to consent" }).click();
  await expect(page.getByRole("button", { name: "Continue to voice sample" })).toBeDisabled();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("checkbox", { name: "I am the living owner" }).check();
  await page.getByRole("checkbox", { name: "I understand and agree" }).check();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("button", { name: "Finish recording" })).toBeVisible();
  await page.clock.fastForward(10000);
  await page.getByRole("button", { name: "Finish recording" }).click();
  await expect(page.getByRole("button", { name: "Continue to voice sample" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue to voice sample" }).click();
  await expect(page.getByRole("button", { name: "Create my AI voice", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("button", { name: "Finish recording" })).toBeVisible();
  await page.clock.fastForward(61000);
  await page.getByRole("button", { name: "Finish recording" }).click();
  await expect(page.getByRole("button", { name: "Create my AI voice", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Create my AI voice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Thank you for sharing your voice." })).toBeVisible();
  expect(submitted).toBe(true);
  await page.getByRole("button", { name: "Make voice preview" }).click();
  await expect(page.getByText("AI recreation of Sarah’s voice, made with their permission.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.verification/enrollment-${testInfo.project.name}.png`, fullPage: true });
});

test("expired or consumed invitations show a clear error instead of allowing recording", async ({ page }) => {
  await page.route(`**/api/record-links/${token}`, (route) => route.fulfill({ status: 410, json: { message: "This recording link has expired or was already used." } }));
  await page.goto(`/r/${token}`);
  await expect(page.getByRole("heading", { name: "This invitation isn’t available." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start recording" })).toHaveCount(0);
});

test("library deletion requires confirmation and removes the card only after success", async ({ page }) => {
  await page.route("**/api/voices", (route) => route.fulfill({ json: { voices: [voice] } }));
  let deleted = false;
  await page.route(`**/api/voices/${voice.id}`, (route) => { deleted = true; return route.fulfill({ json: { deleted: true } }); });
  await page.goto("/caregiver/voices");
  await expect(page.getByRole("heading", { name: "Sarah", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete voice", exact: true }).click();
  expect(deleted).toBe(false);
  await page.getByRole("button", { name: "Yes, delete voice" }).click();
  await expect(page.getByRole("heading", { name: "Sarah", exact: true })).toHaveCount(0);
  expect(deleted).toBe(true);
});

test("a ready voice can be given a persona and turned on for conversations", async ({ page }) => {
  await page.route("**/api/voices", (route) => route.fulfill({ json: { voices: [voice] } }));
  const sent: Record<string, unknown>[] = [];
  await page.route(`**/api/voices/${voice.id}`, (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    return route.fulfill({ json: { voice: { ...voice, active: body.active ?? false, persona: body.persona ?? voice.persona } } });
  });
  await page.goto("/caregiver/voices");
  await page.getByText("How Sarah sounds").click();
  await page.getByLabel("How they talk").fill("Gentle and unhurried");
  await page.getByLabel(/Shared facts/).fill("We love the garden.\nWe bake on Sundays.");
  await page.getByRole("button", { name: "Save persona" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  expect(sent[0]).toMatchObject({ persona: { how_they_talk: "Gentle and unhurried", shared_facts: ["We love the garden.", "We bake on Sundays."] } });
  await page.getByRole("button", { name: "Use in conversations" }).click();
  await expect(page.getByText("Used in conversations", { exact: true })).toBeVisible();
  expect(sent[1]).toEqual({ active: true });
});

test("missing ownership and consent acknowledgments cannot reach cloning",async ({ request }) => {
  const response = await request.post("/api/voices", { multipart: { name: "Sarah", relationship: "Daughter", submissionId: voice.id } });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toContain("explicitly agree");
});
