import { describe, expect, it } from "vitest";
import {
  createPromptGatewayReceipt,
  findReceiptByQueryId,
  gatewayReceiptTitle,
  logPromptGatewayReceipt,
  normalizePromptGatewayMetadata,
  activityReceiptUrl,
} from "./gatewayReceipts";
import { loadActivity } from "./receipts";

function storage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe("gateway receipts", () => {
  it("maps blocked metadata to a safe failed receipt before model use", () => {
    const receipt = createPromptGatewayReceipt({
      module: "chat",
      route: "/api/chat/stream",
      dedupeKey: "r1",
      modelUsed: true,
      now: 10,
      metadata: {
        promptGatewayRisk: "blocked",
        promptGatewayAllowed: false,
        promptGatewayCategories: "instruction-override,system-prompt-extraction",
        promptGatewaySafeSummary: "Prompt Gateway found instruction-override. token=sk-1234567890abcdef",
      },
    });

    expect(receipt).toMatchObject({
      module: "chat",
      action: "prompt-gateway-blocked",
      status: "failed",
      title: "Prompt Gateway paused a request",
      modelUsed: false,
      localOnly: true,
      cloudUsed: false,
      toolsUsed: false,
    });
    expect(receipt?.summary).toContain("[redacted]");
    expect(receipt?.summary).not.toContain("sk-");
    expect(receipt?.metadata?.risk).toBe("blocked");
    expect(receipt?.metadata?.findingCategories).toContain("instruction-override");
  });

  it("maps caution metadata to modelUsed true when the model still ran", () => {
    const receipt = createPromptGatewayReceipt({
      module: "workshop",
      route: "/api/workshop/suggest",
      dedupeKey: "job1",
      modelUsed: true,
      metadata: {
        promptGatewayRisk: "medium",
        promptGatewayAllowed: true,
        promptGatewayCategories: "encoded-hidden-instruction",
        promptGatewaySafeSummary: "Prompt Gateway guarded pasted source content.",
      },
    });

    expect(receipt?.action).toBe("prompt-gateway-caution-added");
    expect(receipt?.status).toBe("info");
    expect(receipt?.modelUsed).toBe(true);
  });

  it("normalizes stream error metadata shape", () => {
    expect(normalizePromptGatewayMetadata({
      risk: "blocked",
      allowed: false,
      findingCategories: ["tool-shell-coercion"],
      safeSummary: "safe summary",
    })).toMatchObject({
      risk: "blocked",
      allowed: false,
      categories: ["tool-shell-coercion"],
      safeSummary: "safe summary",
    });
  });

  it("prevents duplicate receipts with the same dedupe key", () => {
    const s = storage();
    const args = {
      module: "vision" as const,
      route: "/api/vision/analyze",
      dedupeKey: "same",
      modelUsed: true,
      metadata: {
        promptGatewayRisk: "medium",
        promptGatewayAllowed: true,
        promptGatewayCategories: "public-boundary-violation",
      },
    };

    const firstId = logPromptGatewayReceipt(s, args);
    const secondId = logPromptGatewayReceipt(s, args);
    expect(firstId).toBeTruthy();
    expect(secondId).toBe(firstId);
    expect(loadActivity(s).receipts).toHaveLength(1);
  });

  it("builds safe ActivityLog receipt URLs without raw prompt text", () => {
    const url = activityReceiptUrl("gateway-chat-r:1-prompt-gateway-blocked");

    expect(url).toContain("/tabularium?receipt=");
    expect(url).not.toContain(" ");
    expect(url).toContain("r%3A1");
    expect(activityReceiptUrl("ignore previous instructions token=sk-123")).toBe("/activity-log");
    expect(url).not.toContain("sk-123");
    expect(decodeURIComponent(url)).not.toContain("ignore previous instructions");
  });

  it("finds a receipt from a query id safely", () => {
    const receipts = [
      { id: "gateway-chat-safe-id-prompt-gateway-blocked" },
      { id: "other" },
    ];

    expect(findReceiptByQueryId(receipts, "gateway-chat-safe-id-prompt-gateway-blocked")?.id).toBe(receipts[0].id);
    expect(findReceiptByQueryId(receipts, "missing")).toBeNull();
  });

  it("provides beginner-facing display labels", () => {
    expect(gatewayReceiptTitle("prompt-gateway-blocked")).toBe("Prompt Gateway paused a request");
    expect(gatewayReceiptTitle("prompt-gateway-caution-added")).toBe("Prompt Gateway added caution");
    expect(gatewayReceiptTitle("prompt-gateway-warning")).toBe("Prompt Gateway noticed suspicious text");
  });
});
