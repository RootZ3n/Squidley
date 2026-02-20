import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { ReceiptV1 } from "./types.js";

export function newReceiptId(): string {
  return nanoid(12);
}

export async function writeReceipt(rootDir: string, receipt: ReceiptV1): Promise<string> {
  const dir = path.resolve(rootDir, "data", "receipts");
  await mkdir(dir, { recursive: true });

  const file = path.resolve(dir, `${receipt.receipt_id}.json`);
  await writeFile(file, JSON.stringify(receipt, null, 2), "utf-8");
  return file;
}
