import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: ".verification/test-results",
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === "win32" ? "msedge" : "chromium"),
    trace: "retain-on-failure",
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"] } },
    { name: "phone", use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: `${process.platform === "win32" ? "npm.cmd" : "npm"} run dev -- --port 3100`,
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_URL: "",
      GEMINI_API_KEY: "familiar-test-secret-gemini",
      ELEVENLABS_API_KEY: "familiar-test-secret-elevenlabs",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
