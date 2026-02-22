import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],

  // If your web server is already running on 3001, keep reuseExistingServer: true.
  webServer: {
    command: "pnpm -C apps/web start -p 3001",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: true,
    timeout: 60_000
  },

  use: {
    baseURL: "http://127.0.0.1:3001",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },

  // IMPORTANT: use Playwright's bundled Chromium, NOT system "chromium" (snap).
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});