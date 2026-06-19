import { describe, expect, it } from "vitest";
import { CHAT_RECEIPT_ACTION } from "./constants";
import {
  buildChatCompletedReceipt,
  buildChatFailedReceipt,
  buildChatSentReceipt,
  buildChatVelumHandoffReceivedReceipt,
} from "./receipts";

describe("Chat receipt builders", () => {
  it("builds chat lifecycle receipts without message text", () => {
    const sent = buildChatSentReceipt({
      id: "r1",
      createdAt: 1,
      model: "llama3.2:3b",
    });
    const completed = buildChatCompletedReceipt({
      id: "r1-succeeded",
      createdAt: 1,
      completedAt: 2,
      receiptId: "r1",
      model: "llama3.2:3b",
      durationMs: 100,
      characterCount: 42,
      tokenEstimate: 11,
    });

    expect(sent.action).toBe(CHAT_RECEIPT_ACTION.chatSent);
    expect(completed.action).toBe(CHAT_RECEIPT_ACTION.chatCompleted);
    expect(completed.metadata).toEqual({ durationMs: 100, tokenEstimate: 11 });
    expect(JSON.stringify([sent, completed])).not.toContain("user prompt");
  });

  it("builds failed and handoff receipts with safe defaults", () => {
    expect(buildChatFailedReceipt({
      id: "r1-failed",
      createdAt: 2,
      completedAt: 2,
      model: "llama3.2:3b",
      message: "Local model stopped",
      receiptId: "r1",
      interrupted: true,
    })).toMatchObject({
      action: CHAT_RECEIPT_ACTION.chatInterrupted,
      status: "interrupted",
    });
    expect(buildChatVelumHandoffReceivedReceipt()).toMatchObject({
      action: CHAT_RECEIPT_ACTION.velumHandoffReceived,
      modelUsed: false,
    });
  });
});
