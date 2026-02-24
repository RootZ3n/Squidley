// apps/web/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

// IMPORTANT:
// Do NOT use process.env.PORT here.
// In systemd mode, the API service sets PORT=18790 and autonomy inherits it,
// which causes Playwright's webServer to try to start Next on 18790 -> EADDRINUSE.

// Web UI defaults
const WEB_PORT = process.env.WEB_PORT ? Number(process.env.WEB_PORT) : 3001;
const WEB_HOST = process.env.WEB_HOST ?? "127.0.0.1";

// Optional explicit base url override
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://${WEB_HOST}:${WEB_PORT}`;

// In service mode, web is already running; reuse it.
const REUSE_EXISTING =
  process.env.PW_REUSE_EXISTING_SERVER === "1" || !process.env.CI;

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

  // Start/Reuse the Next.js Web UI (NOT the API)
  webServer: {
    // Use -C so this works even when launched from repo root (your tool runner does that)
    command: `pnpm -C apps/web start -p ${WEB_PORT} -H ${WEB_HOST}`,
    url: BASE_URL,
    reuseExistingServer: REUSE_EXISTING,
    timeout: 60_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});