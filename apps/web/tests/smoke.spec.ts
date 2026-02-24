import { test, expect } from "@playwright/test";

test("home loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Squidley/i);

  // Stable selector (avoids strict-mode ambiguity from repeated "Squidley" text)
  await expect(page.getByTestId("app-title")).toBeVisible();
});

test("tool loop tab loads", async ({ page }) => {
  await page.goto("/");

  // Click the Tool Loop tab (exists today)
  await page.getByTestId("tab-tools").click();

  // Verify the Tool Loop panel is visible
  await expect(page.getByTestId("tools-panel")).toBeVisible();
  await expect(page.getByText("Tool Plan")).toBeVisible();
});