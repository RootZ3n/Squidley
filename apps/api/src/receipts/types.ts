// apps/api/src/receipts/types.ts

export type ReceiptCategory =
  | "chat"
  | "tools"
  | "errors"
  | "agents"
  | "build"
  | "diagnostics"
  | "image"
  | "memory"
  | "system";

export interface ReceiptMeta {
  receipt_id: string;
  category: ReceiptCategory;
  created_at: string;
}
