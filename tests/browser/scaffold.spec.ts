import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home and caregiver screens are accessible and usable without a database", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A familiar feeling.");
  await expect(page.getByRole("complementary", { name: "About AI voices" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const homeAudit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(homeAudit.violations).toEqual([]);
  await page.screenshot({ path: `.verification/home-${testInfo.project.name}.png`, fullPage: true });

  await page.getByRole("link", { name: "Set up Familiar", exact: true }).click();
  await expect(page).toHaveURL(/\/caregiver$/);
  await expect(page.getByRole("heading", { name: "Start with the people" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Setup needs a database connection." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & get started" })).toBeDisabled();
  await expect(page.getByLabel("Their name", { exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const caregiverAudit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(caregiverAudit.violations).toEqual([]);
  await page.screenshot({ path: `.verification/caregiver-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("link", { name: "Companion home" }).click();
  await expect(page).toHaveURL("/");
  expect(errors).toEqual([]);
});

test("health, manifest, icons, and client scripts expose no credentials", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(503);
  expect(await health.json()).toEqual({
    status: "unavailable", phase: 8,
    database: { configured: false, ready: false, engine: "postgresql" },
    providers: { gemini: { configured: true }, elevenlabs: { configured: true }, anthropic: { configured: false }, typesafe: { configured: false } },
  });
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
  expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBe(true);
  await page.goto("/caregiver");
  const html = await page.content();
  expect(html).not.toContain("familiar-test-secret");
  const scripts = await page.locator("script[src]").evaluateAll((elements) => elements.map((element) => element.getAttribute("src")!));
  for (const src of scripts) {
    const script = await request.get(src);
    expect(await script.text()).not.toContain("familiar-test-secret");
  }
});
