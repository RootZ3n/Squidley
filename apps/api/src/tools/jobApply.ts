// apps/api/src/tools/jobApply.ts
//
// Job application form filler.
// ALWAYS dry-runs first. NEVER submits without explicit approval.
// Shows Jeff exactly what will be filled before touching anything.

import path from "node:path";
import { readFile } from "node:fs/promises";

export type FormField = {
  label: string;
  selector: string;
  value: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox" | "file";
};

export type ApplicationPlan = {
  url: string;
  fields: FormField[];
  submitSelector?: string;
  warnings: string[];
};

export type ApplicationResult = {
  ok: boolean;
  filled: number;
  skipped: string[];
  submitted: boolean;
  screenshot_path?: string;
  error?: string;
};

// Detect form fields on a job application page
export async function detectApplicationForm(url: string): Promise<{
  fields: Array<{ label: string; selector: string; type: string; required: boolean }>;
  platform: string;
  screenshot_path?: string;
}> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    
    const platform: string = await page.evaluate(new Function(`
      const url = window.location.href;
      if (url.includes("lever.co")) return "lever";
      if (url.includes("greenhouse.io")) return "greenhouse";
      if (url.includes("workday.com")) return "workday";
      if (url.includes("indeed.com")) return "indeed";
      if (url.includes("linkedin.com")) return "linkedin";
      return "unknown";
    `) as any);

    const fields: Array<{ label: string; selector: string; type: string; required: boolean }> = await page.evaluate(new Function(`
      const inputs = document.querySelectorAll("input, textarea, select");
      const out = [];
      inputs.forEach(el => {
        const label = document.querySelector("label[for='" + el.id + "']");
        const labelText = label ? label.textContent.trim() : 
          el.placeholder || el.name || el.getAttribute("aria-label") || "";
        if (!labelText) return;
        out.push({
          label: labelText,
          selector: el.id ? "#" + el.id : el.name ? "[name='" + el.name + "']" : "",
          type: el.tagName.toLowerCase() === "textarea" ? "textarea" : 
                el.tagName.toLowerCase() === "select" ? "select" : (el.type || "text"),
          required: el.required || el.getAttribute("aria-required") === "true"
        });
      });
      return out.slice(0, 30);
    `) as any);

    // Take a screenshot
    const screenshotDir = path.resolve(process.env.ZENSQUID_ROOT ?? process.cwd(), "memory", "screenshots");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `job-form-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });

    return { fields, platform, screenshot_path: screenshotPath };
  } finally {
    await browser.close();
  }
}

// Fill form fields (dry run shows plan, live run executes)
export async function fillApplicationForm(
  plan: ApplicationPlan,
  dryRun = true
): Promise<ApplicationResult> {
  if (dryRun) {
    return {
      ok: true,
      filled: plan.fields.length,
      skipped: [],
      submitted: false,
    };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: false, args: ["--no-sandbox"] });
  // NOTE: headless: false so Jeff can see exactly what's happening
  
  try {
    const page = await browser.newPage();
    await page.goto(plan.url, { waitUntil: "domcontentloaded", timeout: 20000 });
    
    const skipped: string[] = [];
    let filled = 0;

    for (const field of plan.fields) {
      try {
        if (field.type === "text" || field.type === "email" || field.type === "tel") {
          await page.fill(field.selector, field.value);
          filled++;
        } else if (field.type === "textarea") {
          await page.fill(field.selector, field.value);
          filled++;
        } else if (field.type === "select") {
          await page.selectOption(field.selector, field.value);
          filled++;
        } else {
          skipped.push(`${field.label} (${field.type} — manual required)`);
        }
      } catch {
        skipped.push(`${field.label} (could not locate field)`);
      }
    }

    const screenshotDir = path.resolve(process.env.ZENSQUID_ROOT ?? process.cwd(), "memory", "screenshots");
    const screenshotPath = path.join(screenshotDir, `job-filled-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });

    // NEVER auto-submit — always leave browser open for Jeff to review
    // Jeff clicks submit himself
    return { ok: true, filled, skipped, submitted: false, screenshot_path: screenshotPath };
  } catch (e: any) {
    await browser.close();
    return { ok: false, filled: 0, skipped: [], submitted: false, error: e.message };
  }
  // Note: browser intentionally left open so Jeff can review and submit manually
}
