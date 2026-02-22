import { test, expect } from "@playwright/test";

test("home loads", async ({ page }) => {
  await page.goto("http://127.0.0.1:3001/");
  await expect(page).toHaveTitle(/Squidley/i);
});
