// apps/web/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST ?? "127.0.0.1";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },

  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  // ✅ Start Next from THIS directory (apps/web)
  webServer: {
    command: `pnpm start -p ${PORT} -H ${HOST}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});