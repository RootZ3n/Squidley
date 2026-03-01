// apps/api/src/tools/browser.ts
//
// Playwright-based browser control tool.
// Read-only by default. Fill/click require explicit approval via tool proposal system.

import path from "node:path";
import { mkdir } from "node:fs/promises";

type BrowserAction = "visit" | "extract" | "screenshot" | "search";

type BrowserArgs = {
  action: BrowserAction;
  url?: string;
  query?: string;
  selector?: string;
  wait_for?: string;
};

type BrowserResult = {
  ok: boolean;
  title?: string;
  text?: string;
  links?: Array<{ text: string; href: string }>;
  screenshot_path?: string;
  error?: string;
};

export async function runBrowserTool(
  args: BrowserArgs,
  repoRoot: string
): Promise<BrowserResult> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const { action, url, query, selector, wait_for } = args;

    if (action === "search") {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query ?? "")}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      const results: Array<{ text: string; href: string }> = await page.evaluate(
        /* istanbul ignore next */ new Function(`
          const items = document.querySelectorAll("h3");
          const out = [];
          items.forEach(h => {
            const a = h.closest("a");
            if (a && a.href && !a.href.includes("google.com")) {
              out.push({ text: h.textContent || "", href: a.href });
            }
          });
          return out.slice(0, 10);
        `) as any
      );
      const title = await page.title();
      return { ok: true, title, links: results, text: results.map(r => `${r.text}\n${r.href}`).join("\n\n") };
    }

    if (!url) return { ok: false, error: "url required for this action" };
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (wait_for) {
      await page.waitForSelector(wait_for, { timeout: 5000 }).catch(() => {});
    }
    const title = await page.title();

    if (action === "screenshot") {
      const screenshotDir = path.resolve(repoRoot, "memory", "screenshots");
      await mkdir(screenshotDir, { recursive: true });
      const filename = `screenshot-${Date.now()}.png`;
      const filepath = path.join(screenshotDir, filename);
      await page.screenshot({ path: filepath, fullPage: false });
      return { ok: true, title, screenshot_path: filepath };
    }

    if (action === "visit" || action === "extract") {
      await page.evaluate(new Function(`
        ["script","style","nav","footer","header","iframe","noscript"]
          .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
      `) as any);

      const text: string = await page.evaluate(
        new Function("sel", `
          const target = sel ? document.querySelector(sel) : document.body;
          return (target && target.innerText) ? target.innerText.trim().slice(0, 8000) : "";
        `) as any,
        selector ?? null
      );

      let links: Array<{ text: string; href: string }> | undefined;
      if (action === "extract") {
        links = await page.evaluate(new Function(`
          const anchors = document.querySelectorAll("a[href]");
          const out = [];
          anchors.forEach(a => {
            const href = a.href;
            const text = (a.textContent || "").trim();
            if (href && text && !href.startsWith("javascript") && out.length < 30) {
              out.push({ text, href });
            }
          });
          return out;
        `) as any);
      }

      return { ok: true, title, text, links };
    }

    return { ok: false, error: `unknown action: ${action}` };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  } finally {
    await browser.close();
  }
}
