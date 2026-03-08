// apps/api/src/receipts/logger.ts
import { writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { newReceiptId } from "@zensquid/core";
import type { ReceiptCategory } from "./types.js";
import {
  categoryDir,
  receiptPath,
  flatReceiptPath,
  ensureCategoryDir,
  receiptsRoot
} from "./paths.js";

export async function writeTypedReceipt(
  dataDir: string,
  category: ReceiptCategory,
  data: Record<string, unknown>
): Promise<string> {
  const id = data.receipt_id as string ?? newReceiptId();
  await ensureCategoryDir(dataDir, category);
  const p = receiptPath(dataDir, category, id);
  await writeFile(p, JSON.stringify({ ...data, receipt_id: id, category }, null, 2), "utf-8");
  return id;
}

export async function readTypedReceipt(
  dataDir: string,
  id: string
): Promise<Record<string, unknown> | null> {
  // Try category dirs first, then flat fallback
  try {
    const dirs = await readdir(receiptsRoot(dataDir), { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const p = path.join(receiptsRoot(dataDir), d.name, `${id}.json`);
      try {
        return JSON.parse(await readFile(p, "utf-8"));
      } catch {}
    }
    // Flat fallback
    return JSON.parse(await readFile(flatReceiptPath(dataDir, id), "utf-8"));
  } catch {
    return null;
  }
}

export async function listReceiptsByCategory(
  dataDir: string,
  category: ReceiptCategory,
  limit = 50
): Promise<Record<string, unknown>[]> {
  try {
    const dir = categoryDir(dataDir, category);
    const files = await readdir(dir);
    const jsonFiles = files
      .filter(f => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, limit);
    const results = await Promise.all(
      jsonFiles.map(async f => {
        try {
          return JSON.parse(await readFile(path.join(dir, f), "utf-8"));
        } catch {
          return null;
        }
      })
    );
    return results.filter(Boolean);
  } catch {
    return [];
  }
}
