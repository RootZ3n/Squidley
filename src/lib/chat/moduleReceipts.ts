import { CHAT_RECEIPT_ACTION } from "./constants";
import type { ActivityReceiptInput } from "@/lib/activity-log/receipts";

export function buildChatVelumHandoffReceivedReceipt(): ActivityReceiptInput {
  return {
    module: "chat",
    action: CHAT_RECEIPT_ACTION.velumHandoffReceived,
    status: "info",
    title: "Redacted Velum draft received",
    summary: "A redacted draft was received from Velum and placed in the chat draft box. It was not sent automatically.",
    modelUsed: false,
  };
}

export function buildChatVisionHandoffReceivedReceipt(): ActivityReceiptInput {
  return {
    module: "chat",
    action: CHAT_RECEIPT_ACTION.oculusHandoffReceived,
    status: "info",
    title: "Vision analysis received",
    summary: "Vision analysis text was placed in the chat draft box. The image was not included and nothing was sent automatically.",
    modelUsed: false,
  };
}

export function buildChatSentReceipt(args: {
  id: string;
  createdAt: number;
  model: string;
}): ActivityReceiptInput {
  return {
    id: args.id,
    createdAt: args.createdAt,
    module: "chat",
    action: CHAT_RECEIPT_ACTION.chatSent,
    status: "running",
    title: "Local chat started",
    summary: "A message was sent to the local model server. The message text is not stored in this receipt.",
    provider: "local",
    model: args.model,
    modelUsed: true,
    changedLocalStorage: true,
  };
}

export function buildChatFailedReceipt(args: {
  id: string;
  createdAt: number;
  completedAt: number;
  model: string;
  message: string;
  receiptId: string;
  interrupted: boolean;
}): ActivityReceiptInput {
  return {
    id: args.id,
    createdAt: args.createdAt,
    completedAt: args.completedAt,
    module: "chat",
    action: args.interrupted ? CHAT_RECEIPT_ACTION.chatInterrupted : CHAT_RECEIPT_ACTION.chatFailed,
    status: args.interrupted ? "interrupted" : "failed",
    title: args.interrupted ? "Local chat stopped" : "Local chat failed",
    summary: args.message,
    provider: "local",
    model: args.model,
    modelUsed: true,
    changedLocalStorage: true,
    relatedItemId: args.receiptId,
  };
}

export function buildChatCompletedReceipt(args: {
  id: string;
  createdAt: number;
  completedAt: number;
  receiptId: string;
  model: string;
  durationMs: number;
  characterCount: number;
  tokenEstimate: number;
}): ActivityReceiptInput {
  return {
    id: args.id,
    createdAt: args.createdAt,
    completedAt: args.completedAt,
    module: "chat",
    action: CHAT_RECEIPT_ACTION.chatCompleted,
    status: "succeeded",
    title: "Local model replied",
    summary: `The local model streamed a reply. Approximate characters: ${args.characterCount}.`,
    provider: "local",
    model: args.model,
    modelUsed: true,
    changedLocalStorage: true,
    relatedItemId: args.receiptId,
    metadata: {
      durationMs: args.durationMs,
      tokenEstimate: args.tokenEstimate,
    },
  };
}

export function buildChatVelumHandoffCreatedReceipt(): ActivityReceiptInput {
  return {
    module: "chat",
    action: CHAT_RECEIPT_ACTION.velumHandoffCreated,
    status: "info",
    title: "Draft sent to Velum",
    summary: "A Chat draft was prepared for local Velum review. It was not sent to a model.",
    modelUsed: false,
  };
}
