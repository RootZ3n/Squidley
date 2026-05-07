import { describe, expect, it } from "vitest";
import { COLLOQUIUM_RECEIPT_ACTION } from "./constants";
import {
  buildColloquiumChatCompletedReceipt,
  buildColloquiumChatFailedReceipt,
  buildColloquiumChatSentReceipt,
  buildColloquiumVelumHandoffReceivedReceipt,
} from "./receipts";

describe("Colloquium receipt builders", () => {
  it("builds chat lifecycle receipts without message text", () => {
    const sent = buildColloquiumChatSentReceipt({
      id: "r1",
      createdAt: 1,
      model: "llama3.2:3b",
    });
    const completed = buildColloquiumChatCompletedReceipt({
      id: "r1-succeeded",
      createdAt: 1,
      completedAt: 2,
      receiptId: "r1",
      model: "llama3.2:3b",
      durationMs: 100,
      characterCount: 42,
      tokenEstimate: 11,
    });

    expect(sent.action).toBe(COLLOQUIUM_RECEIPT_ACTION.chatSent);
    expect(completed.action).toBe(COLLOQUIUM_RECEIPT_ACTION.chatCompleted);
    expect(completed.metadata).toEqual({ durationMs: 100, tokenEstimate: 11 });
    expect(JSON.stringify([sent, completed])).not.toContain("user prompt");
  });

  it("builds failed and handoff receipts with safe defaults", () => {
    expect(buildColloquiumChatFailedReceipt({
      id: "r1-failed",
      createdAt: 2,
      completedAt: 2,
      model: "llama3.2:3b",
      message: "Local model stopped",
      receiptId: "r1",
      interrupted: true,
    })).toMatchObject({
      action: COLLOQUIUM_RECEIPT_ACTION.chatInterrupted,
      status: "interrupted",
    });
    expect(buildColloquiumVelumHandoffReceivedReceipt()).toMatchObject({
      action: COLLOQUIUM_RECEIPT_ACTION.velumHandoffReceived,
      modelUsed: false,
    });
  });
});
