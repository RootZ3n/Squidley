// apps/api/src/receipts/paths.ts
import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { ReceiptCategory } from "./types.js";

export function receiptsRoot(dataDir: string): string {
  return path.join(dataDir, "receipts");
}

export function categoryDir(dataDir: string, category: ReceiptCategory): string {
  return path.join(receiptsRoot(dataDir), category);
}

export function receiptPath(dataDir: string, category: ReceiptCategory, id: string): string {
  return path.join(categoryDir(dataDir, category), `${id}.json`);
}

// Flat fallback path (legacy — for reading old receipts)
export function flatReceiptPath(dataDir: string, id: string): string {
  return path.join(receiptsRoot(dataDir), `${id}.json`);
}

export async function ensureCategoryDir(dataDir: string, category: ReceiptCategory): Promise<void> {
  await mkdir(categoryDir(dataDir, category), { recursive: true });
}

export const ALL_CATEGORIES: ReceiptCategory[] = [
  "chat", "tools", "errors", "agents", "build",
  "diagnostics", "image", "memory", "system"
];
