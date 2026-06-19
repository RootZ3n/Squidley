import { VELUM_RECEIPT_ACTION } from "./constants";
import type { VelumReviewResult } from "./review";
import type { ActivityReceiptInput } from "@/lib/activity-log/receipts";

export function buildVelumHandoffFromChatReceipt(): ActivityReceiptInput {
  return {
    module: "velum",
    action: VELUM_RECEIPT_ACTION.handoffFromChat,
    status: "info",
    title: "Chat draft opened in Velum",
    summary: "Velum received a browser-local draft from Chat for review. The draft text is not stored in this receipt.",
    modelUsed: false,
  };
}

export function buildVelumHandoffFromMoreInputReceipt(): ActivityReceiptInput {
  return {
    module: "velum",
    action: VELUM_RECEIPT_ACTION.handoffFromMoreInput,
    status: "info",
    title: "More Input draft opened in Velum",
    summary: "Velum received browser-local text from More Input for review. The text is not stored in this receipt.",
    modelUsed: false,
  };
}

export function buildVelumReviewReceipt(review: VelumReviewResult): ActivityReceiptInput {
  return {
    module: "velum",
    action: VELUM_RECEIPT_ACTION.textReviewed,
    status: "info",
    title: "Velum reviewed text",
    summary: `Velum ran local deterministic checks. Overall risk: ${review.overallRisk}; findings: ${review.findings.length}.`,
    modelUsed: false,
  };
}

export function buildVelumRedactionCreatedReceipt(): ActivityReceiptInput {
  return {
    module: "velum",
    action: VELUM_RECEIPT_ACTION.redactionCreated,
    status: "info",
    title: "Redacted preview created",
    summary: "Velum created a local redacted preview. The original text is not stored in this receipt.",
    modelUsed: false,
  };
}

export function buildVelumHandoffToChatReceipt(): ActivityReceiptInput {
  return {
    module: "velum",
    action: VELUM_RECEIPT_ACTION.handoffToChat,
    status: "info",
    title: "Redacted draft sent to Chat",
    summary: "Only the redacted preview was handed to Chat in this browser. It was not sent to a model automatically.",
    modelUsed: false,
  };
}

export function buildVelumHandoffToMoreInputReceipt(): ActivityReceiptInput {
  return {
    module: "velum",
    action: VELUM_RECEIPT_ACTION.handoffToMoreInput,
    status: "info",
    title: "Redacted preview sent to More Input",
    summary: "Only the redacted preview and a small risk summary were handed to More Input in this browser.",
    modelUsed: false,
  };
}
