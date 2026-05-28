"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CompanionTourPanel } from "@/components/CompanionTourPanel";
import { RatioCapabilityNote } from "@/components/RatioCapabilityNote";
import { TourHighlight } from "@/components/TourHighlight";
import { getTour } from "@/lib/tour";
import {
  markTourCompleted,
  readTourMode,
  restartTour as persistRestartTour,
} from "@/lib/firstRun";
import {
  buildLocalMessageMetrics,
  formatDuration,
  formatTokenCount,
  type MessageMetrics,
} from "@/lib/chat/metrics";
import {
  createRunningReceipt,
  failReceipt,
  receiptDurationMs,
  succeedReceipt,
  upsertReceipt,
  type Receipt,
} from "@/lib/chat/receipts";
import type {
  ChatMessage,
  ChatResponseBody,
} from "@/lib/chat/types";
import { parseStreamEventLine, type StreamEvent } from "@/lib/chat/stream";
import type { LocalModelInfo } from "@/lib/providers/ollama";
import {
  getModelReadiness,
  resolveModelSelection,
  type LocalHealthStatus,
} from "@/lib/providers/readiness";
import {
  explainSelectedModelSource,
  loadModelPreferences,
  resolveColloquiumChatModel,
  saveModelPreferences,
  setModuleModelPreference,
  type ModelSourceExplanation,
} from "@/lib/nous/modelPreferences";
import {
  clearCurrentSession,
  createNewSession,
  createSessionsDocument,
  deleteSession,
  formatConversationExport,
  loadStoredSessions,
  saveStoredSessions,
  upsertSession,
  type StoredChatSession,
  type StoredChatSessionsDocument,
  type StoredConversationMessage,
} from "@/lib/chat/conversationStorage";
import {
  consumeVelumHandoff,
  mergeVelumDraft,
  saveColloquiumToVelumHandoff,
} from "@/lib/velum/handoff";
import { consumeOculusToColloquiumHandoff } from "@/lib/oculus/handoff";
import { logTabulariumReceipt } from "@/lib/tabularium/receipts";
import { logPromptGatewayReceipt, tabulariumReceiptUrl } from "@/lib/tabularium/gatewayReceipts";
import { colloquiumAdvancedPlanningDecision, colloquiumBasicChatDecision } from "@/lib/ratio";
import {
  buildColloquiumChatCompletedReceipt,
  buildColloquiumChatFailedReceipt,
  buildColloquiumChatSentReceipt,
  buildColloquiumOculusHandoffReceivedReceipt,
  buildColloquiumVelumHandoffCreatedReceipt,
  buildColloquiumVelumHandoffReceivedReceipt,
} from "@/lib/colloquium/receipts";
import { recordColloquiumCapabilityDecisionReceipt } from "@/lib/colloquium/capabilityReceipts";
import { buildNousModelPreferenceChangedReceipt } from "@/lib/nous/receipts";
import { assessPromptInjectionRisk } from "@/lib/security/promptInjection";
import { recordPromptInjectionAssessmentReceipt } from "@/lib/security/promptInjectionReceipts";

// ---- Local UI types -------------------------------------------------------

type Role = "user" | "assistant" | "error";

interface LocalHealthState {
  status: LocalHealthStatus;
  endpoint: string;
  modelCount?: number;
  reason?: string;
  backendType?: "ollama" | "llama-cpp";
}

interface UiMessage {
  id: string;
  role: Role;
  text: string;
  createdAt?: number;
  provider?: "local";
  model?: string;
  receiptId?: string;
  metrics?: MessageMetrics;
  safetyReceiptHref?: string;
  /** Peh's user-visible correction when the model implied a tool action
   *  this build cannot perform. Shown as a small banner under the reply. The
   *  reply text itself is unchanged. */
  honestyMessage?: string;
  /** Beginner-readable note from the Small Model Reliability Layer when it
   *  handled this turn (health-check, error-summary, or local-answer
   *  validation/retry/fallback for the "wrap" intent). Absent for normal
   *  first-try-success chat. */
  reliabilityNote?: {
    intent: "summarize_error" | "health_check" | "wrap";
    summary: string;
    cloudSuggested: boolean;
    ok: boolean;
    kind?: "validated" | "retried-ok" | "fallback";
  };
  /** Inspected file payload kept on the assistant turn so the UI can
   *  forward it as evidence to later planning requests. Set when a
   *  `file_inspection` stream event with status="completed" arrives. */
  inspectedFile?: { path: string; packedContent: string };
  /** Structured plan + provenance rendered as a compact panel under
   *  the assistant reply. Set when a `plan` stream event arrives. */
  planNote?: {
    id: string;
    confidence: "high" | "medium" | "low";
    confidenceReasoning: string;
    riskLevel: "safe" | "review" | "elevated" | "blocked";
    stepCount: number;
    requiresApproval: boolean;
    suggestedNextInspections: readonly string[];
    known: readonly string[];
    inferred: readonly string[];
    assumed: readonly string[];
    missing: readonly string[];
  };
  /** Tiny-edit approval-required panel — distinct from the read-only
   *  inspection approval. Carries the diff preview + the four hashes
   *  the server bound the approval to. Approve resends the message
   *  with `editApproval` populated; Decline dismisses. */
  editApprovalRequest?: {
    action: "tiny_edit";
    path: string;
    originalSnippet: string;
    proposedSnippet: string;
    originalHash: string;
    proposedHash: string;
    fileHash: string;
    summary: string;
    reason: string;
    confidence: "high" | "medium" | "low";
    riskLevel: "safe" | "review" | "elevated" | "blocked";
    expiresInMs: number;
    limitations: readonly string[];
    diffPreview: {
      path: string;
      lines: readonly string[];
      bytesRemoved: number;
      bytesAdded: number;
      linesChanged: number;
    };
    /** Carries the original (path, original, proposed) so Approve can
     *  resend without parsing them out of the user's message. */
    proposalInput: {
      path: string;
      originalSnippet: string;
      proposedSnippet: string;
      reason?: string;
    };
    state: "pending" | "approved" | "declined";
  };
  /** Outcome of an applied tiny edit — appears below the assistant
   *  reply with a green-or-red status and the verification details. */
  editResult?: {
    status:
      | "approval-required"
      | "blocked"
      | "applied-verified"
      | "applied-rolled-back"
      | "denied";
    path: string;
    applied: boolean;
    rolledBack: boolean;
    summary: string;
    failureReason?: string;
    checks: readonly { id: string; description: string; passed: boolean }[];
  };
  /** Approval-required panel for read-only file inspection. The user
   *  clicks Approve to build an approval token and re-send the original
   *  message; click Decline to dismiss. */
  approvalRequest?: {
    action: "inspect_one_file_safely";
    path: string;
    reason: string;
    riskLevel: "low" | "medium" | "high";
    willRead: string;
    willNotRead: readonly string[];
    secretRedaction: { applied: true; disclaimer: string };
    safetyRules: readonly string[];
    expiresInMs: number;
    /** The original user message that triggered the approval request.
     *  Resending it with an approval token is how the inspection runs. */
    originalMessage: string;
    /** UI state: "pending" until user clicks Approve / Decline. */
    state: "pending" | "approved" | "declined";
  };
}

const EXAMPLE_MESSAGES: readonly UiMessage[] = [
  { id: "ex-1", role: "user", text: "Hi Peh — what is this app for?" },
  {
    id: "ex-2",
    role: "assistant",
    text: 'I\'m Peh. This is Colloquium — Latin for "conversation." We can chat here, and I can teach you the rest of the app as we go.',
    metrics: {
      source: "local",
      model: "example",
      durationMs: 380,
      characterCount: 142,
      tokenCount: 36,
      tokenSource: "approximate",
      cloudUsed: false,
      toolsUsed: false,
    },
  },
  { id: "ex-3", role: "user", text: "Are my messages going to the cloud?" },
  {
    id: "ex-4",
    role: "assistant",
    text: "No. In this public local release, the badge near the top of the screen tells you this is local-only. Cloud models would require an explicit future unlock and clear review first.",
    metrics: {
      source: "local",
      model: "example",
      durationMs: 421,
      characterCount: 200,
      tokenCount: 50,
      tokenSource: "approximate",
      cloudUsed: false,
      toolsUsed: false,
    },
  },
];

const HISTORY_LIMIT = 24;

// ---- Component ------------------------------------------------------------

export default function ColloquiumClient() {
  const router = useRouter();
  const params = useSearchParams();

  // Tour state
  const [tourActive, setTourActive] = useState(false);
  const [tourRunId, setTourRunId] = useState(0);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);

  // Chat state
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pending, setPending] = useState(false);
  const [modelChoice, setModelChoice] = useState("");
  const [models, setModels] = useState<LocalModelInfo[]>([]);
  const [modelsReason, setModelsReason] = useState<string | null>(null);
  const [selectionNote, setSelectionNote] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState<ModelSourceExplanation | null>(null);
  const [importedDraftNote, setImportedDraftNote] = useState<string | null>(null);
  const [gatewayNotice, setGatewayNotice] = useState<{ message: string; href: string } | null>(null);
  const [injectionNotice, setInjectionNotice] = useState<string | null>(null);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [sessionsDoc, setSessionsDoc] = useState<StoredChatSessionsDocument | null>(null);
  const [health, setHealth] = useState<LocalHealthState>({
    status: "checking",
    endpoint: "http://localhost:11434",
  });

  const tour = useMemo(() => getTour("colloquium")!, []);
  const showingExamples = messages.length === 0;
  const visibleMessages = showingExamples ? EXAMPLE_MESSAGES : messages;
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selectedModelRef = useRef("");
  const pendingRef = useRef(false);
  const selectedModel = modelChoice;
  const activeSession = sessionsDoc?.sessions.find(
    (s) => s.id === sessionsDoc.activeSessionId,
  );
  const readiness = getModelReadiness({
    healthStatus: health.status,
    models,
    selectedModel,
    refreshInProgress: refreshingModels,
    streamingInProgress: pending,
  });
  const basicChatRatio = useMemo(
    () => colloquiumBasicChatDecision(selectedModel),
    [selectedModel],
  );
  const advancedPlanningRatio = useMemo(
    () => colloquiumAdvancedPlanningDecision(selectedModel),
    [selectedModel],
  );
  const canSend = readiness.canSend && draft.trim().length > 0;

  // Restore tour intent from query param or persisted preference.
  useEffect(() => {
    const fromQuery = params.get("tour") === "1";
    const fromStorage = readTourMode() === "on";
    setTourActive(fromQuery || fromStorage);
  }, [params]);

  useEffect(() => {
    const handoff = consumeVelumHandoff(window.sessionStorage);
    const oculusHandoff = consumeOculusToColloquiumHandoff(window.sessionStorage);
    if (pendingRef.current) return;
    if (handoff) {
      logTabulariumReceipt(window.localStorage, buildColloquiumVelumHandoffReceivedReceipt());
      setDraft((prev) => {
        const merged = mergeVelumDraft({
          existingDraft: prev,
          importedDraft: handoff.redactedText,
        });
        setImportedDraftNote(merged.note);
        return merged.draft;
      });
      return;
    }
    if (oculusHandoff) {
      logTabulariumReceipt(window.localStorage, buildColloquiumOculusHandoffReceivedReceipt());
      setDraft((prev) => {
        const existing = prev.trim();
        const imported = oculusHandoff.analysisText.trim();
        setImportedDraftNote(
          existing
            ? "Oculus analysis appended below your existing draft. Review it, then click Send when you are ready."
            : "Oculus analysis imported. Review it, then click Send when you are ready.",
        );
        return existing ? `${prev.trimEnd()}\n\n${imported}` : imported;
      });
    }
  }, []);

  // Auto-scroll the chat thread to the bottom when content grows.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, pending]);

  useEffect(() => {
    selectedModelRef.current = modelChoice;
  }, [modelChoice]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const restored = loadStoredSessions(window.localStorage);
    const active = restored.sessions.find((s) => s.id === restored.activeSessionId) ?? restored.sessions[0];
    setSessionsDoc(restored);
    setMessages(active.messages);
    setReceipts(active.receipts);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    setSessionsDoc((prev) => {
      if (!prev) return prev;
      const active = prev.sessions.find((s) => s.id === prev.activeSessionId) ?? prev.sessions[0];
      return upsertSession(prev, snapshotSession(active, messages, receipts), Date.now());
    });
  }, [messages, receipts, storageReady]);

  useEffect(() => {
    if (!storageReady || !sessionsDoc) return;
    saveStoredSessions(window.localStorage, sessionsDoc);
  }, [sessionsDoc, storageReady]);

  const loadLocalStatus = useCallback(
    async (args: { initial?: boolean } = {}) => {
      if (!args.initial && pendingRef.current) return;
      setRefreshingModels(!args.initial);
      setSelectionNote(null);

      try {
        const [healthResponse, modelsResponse] = await Promise.all([
          fetch("/api/local/health"),
          fetch("/api/local/models"),
        ]);
        const healthBody = await healthResponse.json();
        const modelsBody = await modelsResponse.json();
        const nextModels: LocalModelInfo[] = Array.isArray(modelsBody.models)
          ? modelsBody.models
          : [];
        const preferences = loadModelPreferences(window.localStorage);
        const configuredModel =
          typeof modelsBody.defaultModel === "string" ? modelsBody.defaultModel : "";
        const preferenceModel = preferences.modules.colloquium?.chatModel;
        const preferredModel = resolveColloquiumChatModel({
          preferences,
          models: nextModels,
          configuredModel,
        });
        const nextHealth: LocalHealthState = {
          status: healthBody.ok ? "ready" : "unavailable",
          endpoint: healthBody.endpoint ?? "http://localhost:11434",
          modelCount: healthBody.modelCount,
          reason: healthBody.reason,
          backendType: healthBody.backendType ?? undefined,
        };
        const selection = resolveModelSelection({
          models: nextModels,
          currentModel: args.initial ? "" : selectedModelRef.current,
          preferredModel,
        });

        setHealth(nextHealth);
        setModels(nextModels);
        setModelsReason(
          typeof modelsBody.reason === "string" ? modelsBody.reason : null,
        );
        setModelChoice(selection.selectedModel);
        setModelSource(explainSelectedModelSource({
          selectedModel: selection.selectedModel,
          models: nextModels,
          preferenceModel,
          configuredModel,
          moduleLabel: "Colloquium",
        }));
        setSelectionNote(selection.note ?? null);
      } catch {
        const selection = resolveModelSelection({
          models: [],
          currentModel: args.initial ? "" : selectedModelRef.current,
          preferredModel: "",
        });
        setHealth({
          status: "unavailable",
          endpoint: "http://localhost:11434",
          reason:
            "Peh tried to check your local model server, but the check could not complete.",
        });
        setModels([]);
        setModelsReason("Start Ollama, then refresh models after the server is running.");
        setModelChoice(selection.selectedModel);
        setModelSource(explainSelectedModelSource({
          selectedModel: selection.selectedModel,
          models: [],
          moduleLabel: "Colloquium",
        }));
        setSelectionNote(selection.note ?? null);
      } finally {
        setRefreshingModels(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadLocalStatus({ initial: true });
  }, [loadLocalStatus]);

  // ---- Tour controls ------------------------------------------------------
  function handleRestartTour() {
    persistRestartTour();
    setTourRunId((n) => n + 1);
    setTourActive(true);
  }
  function handleEndTour() {
    markTourCompleted();
    setTourActive(false);
    setActiveTarget(null);
  }

  function handleModelChoiceChange(model: string) {
    setModelChoice(model);
    setModelSource(explainSelectedModelSource({
      selectedModel: model,
      models,
      moduleLabel: "Colloquium",
      pageSelection: true,
    }));
    const next = setModuleModelPreference(
      loadModelPreferences(window.localStorage),
      "colloquium",
      "chatModel",
      model,
    );
    saveModelPreferences(window.localStorage, next);
    logTabulariumReceipt(window.localStorage, buildNousModelPreferenceChangedReceipt({
      moduleId: "colloquium",
      role: "chatModel",
      model,
      title: "Colloquium local model preference changed",
      summary: "The Colloquium page saved a browser-local preferred chat model. No cloud provider was enabled.",
    }));
  }

  // ---- Send ---------------------------------------------------------------
  const send = useCallback(
    async (
      text: string,
      options: {
        inspectionApproval?: {
          action: "inspect_one_file_safely";
          path: string;
          approvedAt: number;
          approvalId: string;
        };
        editProposal?: {
          path: string;
          originalSnippet: string;
          proposedSnippet: string;
          reason?: string;
        };
        editApproval?: {
          action: "tiny_edit";
          path: string;
          originalHash: string;
          proposedHash: string;
          fileHash: string;
          approvedAt: number;
          approvalId: string;
        };
      } = {},
    ) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || pending || selectedModel.length === 0) return;

      const userMsg: UiMessage = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "user",
        text: trimmed,
        createdAt: Date.now(),
        provider: "local",
      };

      // History sent upstream: convert prior real chat (skip error bubbles).
      const history: ChatMessage[] = messages
        .filter((m) => m.role !== "error")
        .slice(-HISTORY_LIMIT)
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.text,
      }));

      const receiptId = `r-${userMsg.id}`;
      const assistantId = `a-${userMsg.id}`;
      const startedAt = Date.now();
      userMsg.receiptId = receiptId;
      const runningReceipt = createRunningReceipt({
        id: receiptId,
        model: selectedModel,
        startedAt,
      });
      logTabulariumReceipt(window.localStorage, buildColloquiumChatSentReceipt({
        id: receiptId,
        createdAt: startedAt,
        model: selectedModel,
      }));
      recordColloquiumCapabilityDecisionReceipt(window.localStorage, {
        createdAt: startedAt,
        localModels: models,
        selectedModel,
      });
      const injectionAssessment = assessPromptInjectionRisk(trimmed);
      recordPromptInjectionAssessmentReceipt(window.localStorage, injectionAssessment, {
        createdAt: startedAt,
      });
      const controller = new AbortController();
      abortRef.current = controller;

      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: assistantId,
          role: "assistant",
          text: "",
          createdAt: startedAt,
          provider: "local",
          model: selectedModel,
          receiptId,
        },
      ]);
      setReceipts((prev) => upsertReceipt(prev, runningReceipt));
      setPending(true);
      setDraft("");
      setGatewayNotice(null);
      if (injectionAssessment.shouldWarnUser) {
        setInjectionNotice(
          "Peh noticed instructions that look like they may be trying to override safety, tools, receipts, or cloud controls. " +
          "Chat will continue locally, but tool and cloud actions may require review later.",
        );
      } else {
        setInjectionNotice(null);
      }

      const fail = (message: string, safetyReceiptHref?: string) => {
        const interrupted = message.toLowerCase().includes("stopped");
        const failedAt = Date.now();
        logTabulariumReceipt(window.localStorage, buildColloquiumChatFailedReceipt({
          id: `${receiptId}-${interrupted ? "interrupted" : "failed"}`,
          createdAt: failedAt,
          completedAt: failedAt,
          model: selectedModel,
          message,
          receiptId,
          interrupted,
        }));
        setMessages((prev) => [
          ...prev.filter((m) => !(m.id === assistantId && m.text.trim().length === 0)),
          {
            id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "error",
            text: message,
            createdAt: Date.now(),
            provider: "local",
            model: selectedModel,
            receiptId,
            safetyReceiptHref,
          },
        ]);
        setReceipts((prev) =>
          upsertReceipt(prev, failReceipt(runningReceipt, Date.now(), message)),
        );
        setPending(false);
        abortRef.current = null;
      };

      let response: Response;
      try {
        response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: trimmed,
            history,
            model: selectedModel,
            ...(options.inspectionApproval
              ? { inspectionApproval: options.inspectionApproval }
              : {}),
            ...(options.editProposal ? { editProposal: options.editProposal } : {}),
            ...(options.editApproval ? { editApproval: options.editApproval } : {}),
            ...(() => {
              const inspected = messages
                .filter((m) => m.role === "assistant" && m.inspectedFile)
                .map((m) => m.inspectedFile!)
                .slice(-8);
              return inspected.length > 0 ? { inspectedFiles: inspected } : {};
            })(),
          }),
        });
      } catch {
        if (controller.signal.aborted) {
          fail("Stopped before the local model finished replying.");
          return;
        }
        fail(
          "Peh couldn't reach the local server. Check that it's running, then try again.",
        );
        return;
      }

      if (!response.ok || !response.body) {
        fail(await readChatError(response));
        return;
      }

      let reply = "";
      let model = selectedModel;
      let completedAt = Date.now();
      let durationMs = 0;
      let evalCount: number | undefined;

      try {
        for await (const event of readStreamEvents(response.body)) {
          if (event.type === "meta") {
            if (event.promptGateway) {
              const gatewayReceiptId = logPromptGatewayReceipt(window.localStorage, {
                module: "colloquium",
                route: "/api/chat/stream",
                metadata: event.promptGateway,
                modelUsed: true,
                dedupeKey: receiptId,
              });
              if (gatewayReceiptId) {
                setGatewayNotice({
                  message: "Prompt Gateway added a safety caution for this local model request.",
                  href: tabulariumReceiptUrl(gatewayReceiptId),
                });
              }
            }
            model = event.model;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, model: event.model } : m,
              ),
            );
            setReceipts((prev) =>
              upsertReceipt(prev, { ...runningReceipt, model: event.model }),
            );
          } else if (event.type === "delta") {
            reply += event.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, text: reply || " " } : m,
              ),
            );
          } else if (event.type === "done") {
            completedAt = event.completedAt;
            durationMs = event.durationMs;
            evalCount = event.evalCount;
          } else if (event.type === "honesty") {
            // The local model implied a tool action this build cannot
            // perform. Peh surfaces the correction next to the reply.
            const honestyMessage = event.message;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, honestyMessage } : m,
              ),
            );
          } else if (event.type === "reliability") {
            // The Small Model Reliability Layer handled this turn.
            // For wrap-intent fallbacks the stream may have produced no
            // deltas; replace the assistant reply with the reliability
            // reply and attach a small beginner-readable note.
            reply = event.reply;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      text: event.reply,
                      reliabilityNote: {
                        intent: event.intent,
                        summary: event.summary,
                        cloudSuggested: event.cloudSuggested,
                        ok: event.ok,
                        ...(event.kind ? { kind: event.kind } : {}),
                      },
                    }
                  : m,
              ),
            );
          } else if (event.type === "approval_required") {
            // The user asked to read a file. Show the approval panel
            // under the assistant placeholder. No content has been
            // read yet — the panel's Approve button is the read gate.
            reply = "";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      text: "",
                      approvalRequest: {
                        action: event.action,
                        path: event.path,
                        reason: event.reason,
                        riskLevel: event.riskLevel,
                        willRead: event.willRead,
                        willNotRead: event.willNotRead,
                        secretRedaction: event.secretRedaction,
                        safetyRules: event.safetyRules,
                        expiresInMs: event.expiresInMs,
                        originalMessage: trimmed,
                        state: "pending",
                      },
                    }
                  : m,
              ),
            );
          } else if (event.type === "file_inspection") {
            reply = event.reply;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      text: event.reply,
                      ...(event.status === "completed" && event.path
                        ? {
                            inspectedFile: {
                              path: event.path,
                              packedContent: event.reply,
                            },
                          }
                        : {}),
                    }
                  : m,
              ),
            );
          } else if (event.type === "edit_preview") {
            reply = event.reply;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      text: event.reply,
                      editApprovalRequest: {
                        action: event.action,
                        path: event.path,
                        originalSnippet: event.originalSnippet,
                        proposedSnippet: event.proposedSnippet,
                        originalHash: event.originalHash,
                        proposedHash: event.proposedHash,
                        fileHash: event.fileHash,
                        summary: event.summary,
                        reason: event.reason,
                        confidence: event.confidence,
                        riskLevel: event.riskLevel,
                        expiresInMs: event.expiresInMs,
                        limitations: event.limitations,
                        diffPreview: event.diffPreview,
                        proposalInput: {
                          path: event.path,
                          originalSnippet: event.originalSnippet,
                          proposedSnippet: event.proposedSnippet,
                          reason: event.reason,
                        },
                        state: "pending",
                      },
                    }
                  : m,
              ),
            );
          } else if (event.type === "edit_result") {
            reply = event.reply;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      text: event.reply,
                      editResult: {
                        status: event.status,
                        path: event.path,
                        applied: event.applied,
                        rolledBack: event.rolledBack,
                        summary: event.summary,
                        ...(event.failureReason
                          ? { failureReason: event.failureReason }
                          : {}),
                        checks: [],
                      },
                    }
                  : m,
              ),
            );
          } else if (event.type === "edit_applied" || event.type === "rollback") {
            // Informational events. The composite state lives on
            // editResult; nothing to render separately here.
          } else if (event.type === "verification") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId && m.editResult
                  ? {
                      ...m,
                      editResult: {
                        ...m.editResult,
                        checks: event.checks,
                      },
                    }
                  : m,
              ),
            );
          } else if (event.type === "plan") {
            reply = event.reply;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      text: event.reply,
                      planNote: {
                        id: event.plan.id,
                        confidence: event.plan.confidence,
                        confidenceReasoning: event.plan.confidenceReasoning,
                        riskLevel: event.plan.riskLevel,
                        stepCount: event.plan.stepCount,
                        requiresApproval: event.plan.requiresApproval,
                        suggestedNextInspections:
                          event.plan.suggestedNextInspections,
                        known: event.provenance.known,
                        inferred: event.provenance.inferred,
                        assumed: event.provenance.assumed,
                        missing: event.provenance.missing,
                      },
                    }
                  : m,
              ),
            );
          } else if (event.type === "error") {
            let safetyReceiptHref: string | undefined;
            if (event.promptGateway) {
              const gatewayReceiptId = logPromptGatewayReceipt(window.localStorage, {
                module: "colloquium",
                route: "/api/chat/stream",
                metadata: event.promptGateway,
                modelUsed: false,
                dedupeKey: receiptId,
              });
              if (gatewayReceiptId) safetyReceiptHref = tabulariumReceiptUrl(gatewayReceiptId);
            }
            fail(event.error.message, safetyReceiptHref);
            return;
          }
        }
      } catch {
        if (controller.signal.aborted) {
          fail("Stopped before the local model finished replying.");
          return;
        }
        fail("The local model stream stopped before Peh could finish the reply.");
        return;
      }

      const finalText = reply.length > 0 ? reply : "(empty reply)";
      const metrics = buildLocalMessageMetrics({
        model,
        reply: finalText,
        durationMs,
        modelReportedTokens: evalCount,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: finalText, model, metrics } : m,
        ),
      );
      setReceipts((prev) =>
        upsertReceipt(
          prev,
          succeedReceipt(
            { ...runningReceipt, model },
            completedAt,
          ),
        ),
      );
      logTabulariumReceipt(window.localStorage, buildColloquiumChatCompletedReceipt({
        id: `${receiptId}-succeeded`,
        createdAt: startedAt,
        completedAt,
        model,
        receiptId,
        durationMs: metrics.durationMs,
        characterCount: metrics.characterCount,
        tokenEstimate: metrics.tokenCount,
      }));
      setPending(false);
      abortRef.current = null;
    },
    [messages, pending, selectedModel],
  );

  const handleApproveInspection = useCallback(
    (messageId: string) => {
      const target = messages.find((m) => m.id === messageId);
      if (!target || !target.approvalRequest) return;
      if (target.approvalRequest.state !== "pending") return;
      const approval = {
        action: "inspect_one_file_safely" as const,
        path: target.approvalRequest.path,
        approvedAt: Date.now(),
        approvalId: `appr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.approvalRequest
            ? {
                ...m,
                approvalRequest: { ...m.approvalRequest, state: "approved" },
              }
            : m,
        ),
      );
      void send(target.approvalRequest.originalMessage, {
        inspectionApproval: approval,
      });
    },
    [messages, send],
  );

  const handleApproveEdit = useCallback(
    (messageId: string) => {
      const target = messages.find((m) => m.id === messageId);
      if (!target || !target.editApprovalRequest) return;
      if (target.editApprovalRequest.state !== "pending") return;
      const req = target.editApprovalRequest;
      const approval = {
        action: "tiny_edit" as const,
        path: req.path,
        originalHash: req.originalHash,
        proposedHash: req.proposedHash,
        fileHash: req.fileHash,
        approvedAt: Date.now(),
        approvalId: `edit-appr-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.editApprovalRequest
            ? {
                ...m,
                editApprovalRequest: {
                  ...m.editApprovalRequest,
                  state: "approved",
                },
              }
            : m,
        ),
      );
      void send(
        `apply tiny edit to ${req.path}`,
        {
          editProposal: req.proposalInput,
          editApproval: approval,
        },
      );
    },
    [messages, send],
  );

  const handleDeclineEdit = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.editApprovalRequest
          ? {
              ...m,
              text:
                "Peh did not apply the edit. Nothing was written to disk.",
              editApprovalRequest: {
                ...m.editApprovalRequest,
                state: "declined",
              },
            }
          : m,
      ),
    );
  }, []);

  const handleDeclineInspection = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.approvalRequest
          ? {
              ...m,
              text:
                "Peh did not read the file. You can ask again when you're ready, or rephrase the question.",
              approvalRequest: { ...m.approvalRequest, state: "declined" },
            }
          : m,
      ),
    );
  }, []);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send(draft);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleNewChat() {
    if (pending) return;
    const next = createNewSession(sessionsDoc ?? createSessionsDocument());
    const active = next.sessions.find((s) => s.id === next.activeSessionId) ?? next.sessions[0];
    setSessionsDoc(next);
    setMessages(active.messages);
    setReceipts(active.receipts);
    setDraft("");
  }

  function handleSwitchSession(sessionId: string) {
    if (pending || !sessionsDoc || sessionId === sessionsDoc.activeSessionId) return;
    const next = createSessionsDocument({
      sessions: sessionsDoc.sessions,
      activeSessionId: sessionId,
    });
    const active = next.sessions.find((s) => s.id === next.activeSessionId) ?? next.sessions[0];
    setSessionsDoc(next);
    setMessages(active.messages);
    setReceipts(active.receipts);
    setDraft("");
  }

  function handleDeleteSession() {
    if (pending || !sessionsDoc) return;
    const confirmed = window.confirm(
      "Delete this chat? This only deletes the chat saved in this browser.",
    );
    if (!confirmed) return;
    const next = deleteSession(sessionsDoc, sessionsDoc.activeSessionId);
    const active = next.sessions.find((s) => s.id === next.activeSessionId) ?? next.sessions[0];
    setSessionsDoc(next);
    setMessages(active.messages);
    setReceipts(active.receipts);
    setDraft("");
  }

  function handleClearChat() {
    const confirmed = window.confirm(
      "Clear this Colloquium chat? This only clears the chat saved in this browser.",
    );
    if (!confirmed) return;
    if (pending || !sessionsDoc) return;
    const next = clearCurrentSession(sessionsDoc, sessionsDoc.activeSessionId);
    setMessages([]);
    setReceipts([]);
    setSessionsDoc(next);
  }

  function handleExportChat() {
    const storedMessages = messages.flatMap(toStoredMessage);
    const exported = formatConversationExport({
      messages: storedMessages,
      receipts,
    });
    const blob = new Blob([exported], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peh-colloquium-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleReviewInVelum() {
    if (pending || draft.trim().length === 0) return;
    const ok = saveColloquiumToVelumHandoff(window.sessionStorage, draft);
    if (!ok) {
      setImportedDraftNote("Peh could not prepare this draft for Velum in this browser.");
      return;
    }
    logTabulariumReceipt(window.localStorage, buildColloquiumVelumHandoffCreatedReceipt());
    router.push("/velum?from=colloquium");
  }

  // ---- Render -------------------------------------------------------------

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Topbar — title + session + model + tour */}
      <header
        style={{
          flexShrink: 0,
          padding: "16px clamp(16px, 4vw, 32px) 14px",
          borderBottom: "1px solid rgba(132,201,255,0.12)",
          background:
            "linear-gradient(180deg, rgba(7,16,34,0.78) 0%, rgba(3,8,20,0.78) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          position: "relative",
          zIndex: 5,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            margin: "0 auto",
            width: "100%",
            maxWidth: 1280,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: "clamp(22px, 2.4vw, 30px)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--accent-chat)",
                margin: 0,
                lineHeight: 1,
                textShadow:
                  "0 0 18px rgba(77,245,200,0.45), 0 0 48px rgba(77,245,200,0.2)",
              }}
            >
              Colloquium
            </h1>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              Conversation · local chat
            </span>
          </div>

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <ChatSessionField
              sessionsDoc={sessionsDoc}
              pending={pending}
              onSwitch={handleSwitchSession}
            />
            <button
              type="button"
              onClick={handleNewChat}
              disabled={pending}
              className="sq-btn"
              style={{ fontSize: 13 }}
            >
              + New chat
            </button>
            <TourHighlight target="local-only-indicator" active={activeTarget}>
              <LocalStatusPill variant="localOnly" />
            </TourHighlight>
            <TourHighlight target="model-selector" active={activeTarget}>
              <ModelSelectField
                models={models}
                modelChoice={modelChoice}
                pending={pending}
                refreshing={refreshingModels}
                onChange={handleModelChoiceChange}
              />
            </TourHighlight>
            <button
              type="button"
              onClick={handleRestartTour}
              className="sq-btn"
              style={{ fontSize: 13 }}
              aria-label="Restart the Colloquium tour"
            >
              ↻ Restart tour
            </button>
          </div>
        </div>

        {modelSource && modelSource.kind !== "unavailable" && (
          <div
            style={{
              margin: "10px auto 0",
              maxWidth: 1280,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.04em",
              color: "rgba(238,240,255,0.72)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>{modelSource.message}</span>
            <Link
              href="/nous"
              style={{
                color: "var(--accent-vision)",
                textDecoration: "underline",
                textDecorationStyle: "dotted",
                textUnderlineOffset: "3px",
              }}
            >
              Change in Nous
            </Link>
          </div>
        )}
      </header>

      <LocalHealthBanner
        health={health}
        readinessMessage={readiness.message}
        refreshInProgress={refreshingModels}
        streamingInProgress={pending}
        selectionNote={selectionNote}
        onRefresh={() => void loadLocalStatus()}
      />

      <div
        style={{
          margin: "12px auto 0",
          width: "100%",
          maxWidth: 1280,
          padding: "0 clamp(16px, 4vw, 32px)",
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}
      >
        <RatioCapabilityNote decision={basicChatRatio} title="Ratio: basic chat" compact />
        <RatioCapabilityNote decision={advancedPlanningRatio} title="Ratio: advanced planning" compact />
      </div>

      {/* Body */}
      <div
        className="sq-chat-body"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          gap: 16,
          padding: "16px clamp(16px, 4vw, 32px) 24px",
          margin: "0 auto",
          width: "100%",
          maxWidth: 1280,
        }}
      >
        <section
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <TourHighlight
            target="chat-thread"
            active={activeTarget}
            className="sq-glass sq-fade-in"
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                padding: "20px clamp(14px, 2vw, 24px)",
                maxHeight: "calc(100dvh - 320px)",
                overflowY: "auto",
                minHeight: 280,
              }}
            >
              {showingExamples && <ExampleHeader />}
              <LocalReadinessGuidance
                health={health}
                modelCount={models.length}
                modelsReason={modelsReason}
                selectionNote={selectionNote}
              />
              {visibleMessages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  activeTarget={activeTarget}
                  isExample={showingExamples}
                  onApproveInspection={handleApproveInspection}
                  onDeclineInspection={handleDeclineInspection}
                  onApproveEdit={handleApproveEdit}
                  onDeclineEdit={handleDeclineEdit}
                />
              ))}
              <div ref={threadEndRef} />
            </div>
          </TourHighlight>

          <TourHighlight target="input-box" active={activeTarget}>
            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: 10,
                padding: 10,
                borderRadius: 18,
                border: "1px solid var(--border-lit)",
                background:
                  "linear-gradient(180deg, rgba(17,21,40,0.72), rgba(8,11,20,0.72))",
                boxShadow:
                  "inset 0 1px 0 rgba(186,236,255,0.08), 0 16px 40px rgba(0,0,0,0.32)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
              }}
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                placeholder={
                  pending
                    ? "Peh is thinking…"
                    : selectedModel.length === 0
                      ? "Pull a local model with Ollama to start chatting"
                      : "Message Peh… (Enter to send, Shift+Enter for newline)"
                }
                rows={2}
                style={{
                  flex: 1,
                  resize: "none",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  fontSize: 16,
                  lineHeight: 1.55,
                  padding: "8px 10px",
                  minHeight: 56,
                }}
              />
              {pending ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="sq-btn sq-btn-warn"
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    padding: "0 22px",
                    minWidth: 96,
                  }}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  className="sq-btn sq-btn-primary"
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    padding: "0 26px",
                    minWidth: 96,
                  }}
                  disabled={!canSend}
                  aria-busy={pending}
                >
                  Send
                </button>
              )}
            </form>
            {draft.trim().length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "10px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(244,114,182,0.32)",
                  background: "rgba(244,114,182,0.08)",
                  color: "#f8c8df",
                  fontSize: 13,
                }}
              >
                <span>
                  Review this draft for secrets or risky instructions before
                  sending.
                </span>
                <button
                  type="button"
                  onClick={handleReviewInVelum}
                  disabled={pending}
                  className="sq-btn"
                  style={{
                    fontSize: 12,
                    padding: "6px 12px",
                    borderColor: "rgba(244,114,182,0.5)",
                    color: "#f8c8df",
                  }}
                >
                  Review in Velum
                </button>
              </div>
            )}
            {importedDraftNote && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(77,245,200,0.34)",
                  background: "rgba(77,245,200,0.08)",
                  color: "#cdfdec",
                  fontSize: 13,
                  lineHeight: 1.55,
                }}
              >
                <p>{importedDraftNote}</p>
                <p style={{ marginTop: 6, opacity: 0.78 }}>
                  Only Velum&rsquo;s redacted preview was imported. Colloquium
                  still uses your local model server, with no cloud fallback.
                </p>
              </div>
            )}
            {gatewayNotice && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(250,204,21,0.34)",
                  background: "rgba(250,204,21,0.08)",
                  color: "#fde68a",
                  fontSize: 13,
                  lineHeight: 1.55,
                }}
              >
                <p>{gatewayNotice.message}</p>
                <Link href={gatewayNotice.href} className="underline decoration-dotted">
                  View safety receipt
                </Link>
              </div>
            )}
            {injectionNotice && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(250,204,21,0.34)",
                  background: "rgba(250,204,21,0.08)",
                  color: "#fde68a",
                  fontSize: 13,
                  lineHeight: 1.55,
                }}
              >
                <p>{injectionNotice}</p>
              </div>
            )}
          </TourHighlight>
        </section>

        <TourHighlight
          target="receipts"
          active={activeTarget}
          className="sq-receipts-column"
        >
          <ReceiptsPanel
            receipts={receipts}
            hasMessages={messages.length > 0}
            streamingInProgress={pending}
            onClearChat={handleClearChat}
            onDeleteSession={handleDeleteSession}
            onExportChat={handleExportChat}
            sessionTitle={activeSession?.title ?? "New chat"}
          />
        </TourHighlight>
      </div>

      {tourActive && (
        <CompanionTourPanel
          key={tourRunId}
          tour={tour}
          onActiveTargetChange={setActiveTarget}
          onClose={handleEndTour}
          onFinish={handleEndTour}
        />
      )}
    </div>
  );
}

// ---- Subcomponents --------------------------------------------------------

function ChatSessionField({
  sessionsDoc,
  pending,
  onSwitch,
}: {
  sessionsDoc: StoredChatSessionsDocument | null;
  pending: boolean;
  onSwitch: (sessionId: string) => void;
}) {
  const sessions = sessionsDoc?.sessions ?? [];
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        border: "1px solid var(--border-lit)",
        background: "rgba(7,16,34,0.6)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: "0.06em",
        color: "var(--text-primary)",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>Chat</span>
      <select
        aria-label="Local chat session"
        value={sessionsDoc?.activeSessionId ?? ""}
        onChange={(e) => onSwitch(e.target.value)}
        disabled={!sessionsDoc || pending}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-primary)",
          fontFamily: "inherit",
          fontSize: "inherit",
          maxWidth: 200,
        }}
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.title} · {formatSessionTime(session.updatedAt)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModelSelectField({
  models,
  modelChoice,
  pending,
  refreshing,
  onChange,
}: {
  models: LocalModelInfo[];
  modelChoice: string;
  pending: boolean;
  refreshing: boolean;
  onChange: (model: string) => void;
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        border: "1px solid rgba(77,245,200,0.32)",
        background: "rgba(77,245,200,0.06)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: "0.06em",
        color: "var(--accent-chat)",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>Model</span>
      <select
        aria-label="Model & provider"
        value={modelChoice}
        onChange={(e) => onChange(e.target.value)}
        disabled={models.length === 0 || pending || refreshing}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--accent-chat)",
          fontFamily: "inherit",
          fontSize: "inherit",
          maxWidth: 220,
        }}
      >
        {models.length === 0 ? (
          <option value="">No local models</option>
        ) : (
          models.map((model) => (
            <option key={model.name} value={model.name} style={{ color: "#0b0e1c" }}>
              Local · {model.displayName}
            </option>
          ))
        )}
      </select>
    </label>
  );
}

const STATUS_PALETTE = {
  ok: { fg: "#7bffdd", bg: "rgba(77,245,200,0.10)", border: "rgba(77,245,200,0.42)" },
  warn: { fg: "#ffd28a", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.42)" },
  info: { fg: "#cbd7ea", bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.32)" },
  error: { fg: "#ffb4b4", bg: "rgba(248,81,73,0.10)", border: "rgba(248,81,73,0.42)" },
} as const;
type StatusTone = keyof typeof STATUS_PALETTE;

function LocalStatusPill({ variant }: { variant: "localOnly" | "cloudLocked" | "noModelNeeded" | "preparedNotActive" }) {
  const tone: StatusTone =
    variant === "cloudLocked" || variant === "preparedNotActive" ? "warn" : variant === "noModelNeeded" ? "info" : "ok";
  const palette = STATUS_PALETTE[tone];
  const text =
    variant === "cloudLocked"
      ? "Cloud locked. No cloud fallback."
      : variant === "noModelNeeded"
        ? "No model needed."
        : variant === "preparedNotActive"
          ? "Prepared · not active."
          : "Local-only · stays in browser";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: palette.fg,
          boxShadow: `0 0 8px ${palette.fg}`,
        }}
      />
      {text}
    </span>
  );
}

function StatusCallout({
  tone,
  title,
  body,
  detail,
  hint,
  action,
}: {
  tone: StatusTone;
  title: string;
  body: ReactNode;
  detail?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  const palette = STATUS_PALETTE[tone];
  return (
    <div
      style={{
        margin: "12px clamp(16px, 4vw, 32px) 0",
        padding: "14px 18px",
        borderRadius: 16,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        fontSize: 14,
        lineHeight: 1.55,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <p style={{ fontWeight: 600, color: palette.fg }}>{title}</p>
      {body && <p style={{ marginTop: 4, color: palette.fg, opacity: 0.92 }}>{body}</p>}
      {detail && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 10,
            border: `1px solid ${palette.border}`,
            background: "rgba(2,6,16,0.45)",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: palette.fg,
          }}
        >
          {detail}
        </div>
      )}
      {hint && (
        <p style={{ marginTop: 8, fontSize: 12, color: palette.fg, opacity: 0.78 }}>{hint}</p>
      )}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

function LocalHealthBanner({
  health,
  readinessMessage,
  refreshInProgress,
  streamingInProgress,
  selectionNote,
  onRefresh,
}: {
  health: LocalHealthState;
  readinessMessage: string;
  refreshInProgress: boolean;
  streamingInProgress: boolean;
  selectionNote: string | null;
  onRefresh: () => void;
}) {
  const refreshButton = (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshInProgress || streamingInProgress}
      className="sq-btn"
      style={{ fontSize: 12, padding: "6px 12px" }}
    >
      {refreshInProgress ? "Refreshing…" : "Refresh models"}
    </button>
  );

  if (health.status === "checking") {
    return (
      <StatusCallout
        tone="info"
        title="Checking your local model server…"
        body="Peh uses your local model server here. No cloud fallback is used."
      />
    );
  }

  if (health.status === "ready") {
    const backendLabel = health.backendType === "llama-cpp" ? "OpenAI-compatible local backend" : "Ollama";
    return (
      <StatusCallout
        tone="ok"
        title={health.backendType === "llama-cpp" ? `${backendLabel} configured.` : `Local model server ready (${backendLabel}).`}
        body={
          typeof health.modelCount === "number"
            ? `${health.modelCount} local model${health.modelCount === 1 ? "" : "s"} found.`
            : "Colloquium will stream replies from your local server."
        }
        hint={
          <>
            {selectionNote ? `${selectionNote} ` : ""}
            {readinessMessage} Peh uses your local model server here, with no cloud fallback.
            {health.backendType === "llama-cpp" ? " llama-server support is pending real binary validation." : ""}
          </>
        }
        action={refreshButton}
      />
    );
  }

  return (
    <StatusCallout
      tone="warn"
      title="Local model server not available yet."
      body={
        health.reason ??
        `Peh tried to reach your local model server at ${health.endpoint}, but it does not seem to be running.`
      }
      detail={
        <>
          <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 12, opacity: 0.7 }}>Option A: Ollama (easiest)</div>
          <div>ollama serve</div>
          <div>ollama pull llama3.2</div>
          <div style={{ marginTop: 8, marginBottom: 6, fontWeight: 600, fontSize: 12, opacity: 0.7 }}>Option B: llama-server</div>
          <div>llama-server -m your-model.gguf --port 8080</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Set PEH_LOCAL_BACKEND=llama-cpp in .env.local</div>
        </>
      }
      hint={
        <>
          Start Ollama or an OpenAI-compatible local backend, then refresh models. Check <code style={{ fontFamily: "var(--font-mono)" }}>PEH_LOCAL_ENDPOINT</code> if using a custom port. No cloud fallback is used.
        </>
      }
      action={refreshButton}
    />
  );
}

function LocalReadinessGuidance({
  health,
  modelCount,
  modelsReason,
  selectionNote,
}: {
  health: LocalHealthState;
  modelCount: number;
  modelsReason: string | null;
  selectionNote: string | null;
}) {
  if (health.status === "ready" && modelCount === 0) {
    const isLlamaCpp = health.backendType === "llama-cpp";
    return (
      <InlineCallout
        tone="info"
        title="Peh found your local model server, but no local models are available yet."
        body={
          modelsReason ??
          "Install one local model, then use Refresh models. Send stays disabled until a local model is available. No cloud fallback will be used."
        }
        detail={isLlamaCpp ? "llama-server -m your-model.gguf" : "ollama pull llama3.2"}
      />
    );
  }

  if (health.status === "unavailable") {
    return (
      <InlineCallout
        tone="warn"
        title="Peh tried to reach your local model server."
        body="Start Ollama or an OpenAI-compatible local backend, pull/load a local model if needed, then use Refresh models. Send stays disabled until a local model is ready."
        detail={
          <>
            <div>ollama serve && ollama pull llama3.2</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>or: llama-server -m model.gguf --port 8080</div>
          </>
        }
      />
    );
  }

  if (selectionNote) {
    return (
      <p
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px dashed var(--border-lit)",
          background: "rgba(7,16,34,0.4)",
          fontSize: 13,
          color: "var(--text-dim)",
          textAlign: "center",
        }}
      >
        {selectionNote}
      </p>
    );
  }

  return null;
}

function InlineCallout({
  tone,
  title,
  body,
  detail,
}: {
  tone: StatusTone;
  title: string;
  body?: ReactNode;
  detail?: ReactNode;
}) {
  const palette = STATUS_PALETTE[tone];
  return (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 14,
        border: `1px dashed ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        fontSize: 14,
        lineHeight: 1.55,
      }}
    >
      <p style={{ fontWeight: 600 }}>{title}</p>
      {body && <p style={{ marginTop: 4, opacity: 0.92, fontSize: 13 }}>{body}</p>}
      {detail && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 10,
            border: `1px solid ${palette.border}`,
            background: "rgba(2,6,16,0.45)",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
          }}
        >
          {detail}
        </div>
      )}
    </div>
  );
}

function ExampleHeader() {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px dashed var(--border-lit)",
        background: "rgba(7,16,34,0.4)",
        textAlign: "center",
        fontSize: 13,
        color: "var(--text-dim)",
      }}
    >
      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
        Example conversation.
      </span>{" "}
      This is what Colloquium looks like — it will be replaced with your own
      chat once you send a message.
    </div>
  );
}

function MessageBubble({
  message,
  activeTarget,
  isExample,
  onApproveInspection,
  onDeclineInspection,
  onApproveEdit,
  onDeclineEdit,
}: {
  message: UiMessage;
  activeTarget: string | null;
  isExample: boolean;
  onApproveInspection?: (messageId: string) => void;
  onDeclineInspection?: (messageId: string) => void;
  onApproveEdit?: (messageId: string) => void;
  onDeclineEdit?: (messageId: string) => void;
}) {
  if (message.role === "error") {
    const palette = STATUS_PALETTE.warn;
    return (
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <div
          style={{
            maxWidth: "min(620px, 88%)",
            padding: "14px 18px",
            borderRadius: 18,
            border: `1px solid ${palette.border}`,
            background: palette.bg,
            color: palette.fg,
            fontSize: 14,
            lineHeight: 1.55,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <p style={{ fontWeight: 600 }}>Peh hit a snag.</p>
          <p style={{ marginTop: 4 }}>{message.text}</p>
          {message.safetyReceiptHref && (
            <p style={{ marginTop: 8 }}>
              <Link
                href={message.safetyReceiptHref}
                className="underline decoration-dotted"
              >
                View safety receipt
              </Link>
            </p>
          )}
          <p style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
            Tip: see{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>
              docs/LOCAL_CHAT.md
            </code>{" "}
            for setup help.
          </p>
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";
  const userBubble = {
    background:
      "linear-gradient(135deg, rgba(77,245,200,0.22) 0%, rgba(96,165,250,0.20) 60%, rgba(167,139,250,0.20) 100%)",
    border: "1px solid rgba(77,245,200,0.42)",
    color: "#e9fff5",
    boxShadow: "0 14px 30px rgba(0,0,0,0.32), inset 0 1px 0 rgba(186,236,255,0.18)",
  } as const;
  const assistantBubble = {
    background:
      "linear-gradient(180deg, rgba(17,21,40,0.78), rgba(8,11,20,0.78))",
    border: "1px solid var(--glass-stroke)",
    color: "var(--text-primary)",
    boxShadow:
      "inset 0 1px 0 rgba(186,236,255,0.10), 0 10px 28px rgba(0,0,0,0.34)",
  } as const;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        opacity: isExample ? 0.82 : 1,
      }}
    >
      <div style={{ maxWidth: "min(680px, 88%)" }}>
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 18,
            whiteSpace: "pre-wrap",
            fontSize: 16,
            lineHeight: 1.6,
            ...(isUser ? userBubble : assistantBubble),
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          {message.text.length > 0 ? (
            message.text
          ) : (
            <span style={{ fontStyle: "italic", color: "var(--text-dim)" }}>
              Peh is thinking…
            </span>
          )}
        </div>
        {message.role === "assistant" && message.honestyMessage && (
          <div
            role="note"
            aria-label="Peh honesty correction"
            style={{
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(252,211,77,0.45)",
              background: "rgba(252,211,77,0.10)",
              color: "#fde68a",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ fontWeight: 600 }}>Honesty note:</strong>{" "}
            {message.honestyMessage}
          </div>
        )}
        {message.role === "assistant" && message.reliabilityNote && (
          <div
            role="note"
            aria-label="Reliability layer note"
            style={{
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(125,211,252,0.35)",
              background: "rgba(125,211,252,0.08)",
              color: "#bae6fd",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ fontWeight: 600 }}>
              {message.reliabilityNote.intent === "health_check"
                ? "Local health check:"
                : message.reliabilityNote.intent === "wrap"
                ? message.reliabilityNote.kind === "retried-ok"
                  ? "Re-asked the local model:"
                  : "Local model could not answer:"
                : "Reliability layer:"}
            </strong>{" "}
            {message.reliabilityNote.summary}
            {message.reliabilityNote.cloudSuggested && (
              <span style={{ marginLeft: 6 }}>
                (cloud was offered, never used — your call)
              </span>
            )}
          </div>
        )}
        {message.role === "assistant" && message.planNote && (
          <div
            role="region"
            aria-label="Plan and provenance"
            style={{
              marginTop: 8,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(56,189,248,0.45)",
              background: "rgba(56,189,248,0.06)",
              color: "#e0f2fe",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <strong style={{ fontWeight: 600 }}>Plan</strong>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background:
                    message.planNote.confidence === "high"
                      ? "rgba(74,222,128,0.2)"
                      : message.planNote.confidence === "medium"
                      ? "rgba(251,191,36,0.2)"
                      : "rgba(248,113,113,0.2)",
                  color:
                    message.planNote.confidence === "high"
                      ? "#86efac"
                      : message.planNote.confidence === "medium"
                      ? "#fcd34d"
                      : "#fca5a5",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Confidence: {message.planNote.confidence}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "rgba(148,163,184,0.18)",
                  color: "#cbd5e1",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Risk: {message.planNote.riskLevel}
              </span>
            </div>
            <div style={{ marginBottom: 6, opacity: 0.85 }}>
              {message.planNote.confidenceReasoning}
            </div>
            {message.planNote.known.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <strong>Known (from inspected files / receipts):</strong>
                <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                  {message.planNote.known.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
            {message.planNote.inferred.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <strong>Inferred:</strong>
                <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                  {message.planNote.inferred.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
            {message.planNote.assumed.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <strong>Assumed:</strong>
                <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                  {message.planNote.assumed.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
            {message.planNote.missing.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <strong>Missing:</strong>
                <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                  {message.planNote.missing.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              </div>
            )}
            {message.planNote.suggestedNextInspections.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <strong>Suggested next inspections (with your approval):</strong>
                <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                  {message.planNote.suggestedNextInspections.map((p, i) => (
                    <li key={i}>
                      <code style={{ fontSize: 12 }}>{p}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {message.role === "assistant" && message.approvalRequest && (
          <div
            role="region"
            aria-label="Peh wants approval to read a file"
            style={{
              marginTop: 8,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(167,139,250,0.45)",
              background: "rgba(167,139,250,0.08)",
              color: "#ddd6fe",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Peh wants to read this file
            </div>
            <div style={{ marginBottom: 8 }}>
              Reading is not the same as editing. Peh will not change the
              file. You can decline at any time.
            </div>
            <div style={{ marginBottom: 6 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  marginRight: 6,
                  borderRadius: 4,
                  background: "rgba(74,222,128,0.18)",
                  color: "#86efac",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Read-only
              </span>
              <code style={{ fontSize: 12 }}>{message.approvalRequest.path}</code>
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong>Will read:</strong> {message.approvalRequest.willRead}
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong>Will not read:</strong>
              <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
                {message.approvalRequest.willNotRead.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
            <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.85 }}>
              {message.approvalRequest.secretRedaction.disclaimer}
            </div>
            {message.approvalRequest.state === "pending" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onApproveInspection?.(message.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(74,222,128,0.5)",
                    background: "rgba(74,222,128,0.18)",
                    color: "#bbf7d0",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Approve and read once
                </button>
                <button
                  type="button"
                  onClick={() => onDeclineInspection?.(message.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.45)",
                    background: "rgba(148,163,184,0.12)",
                    color: "#cbd5e1",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Decline
                </button>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  fontStyle: "italic",
                  color:
                    message.approvalRequest.state === "approved"
                      ? "#bbf7d0"
                      : "#cbd5e1",
                }}
              >
                {message.approvalRequest.state === "approved"
                  ? "Approved. Peh is reading the file once and will not change it."
                  : "Declined. The file was not read."}
              </div>
            )}
          </div>
        )}
        {message.role === "assistant" && message.editApprovalRequest && (
          <div
            role="region"
            aria-label="Tiny edit approval"
            style={{
              marginTop: 8,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(244,114,182,0.45)",
              background: "rgba(244,114,182,0.08)",
              color: "#fbcfe8",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Peh wants to make a tiny edit
            </div>
            <div style={{ marginBottom: 6 }}>
              Editing is not the same as automatic. This applies one
              targeted text replacement and then re-reads the file to
              verify. Peh rolls back if anything looks wrong.
            </div>
            <div style={{ marginBottom: 6 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  marginRight: 6,
                  borderRadius: 4,
                  background: "rgba(244,114,182,0.18)",
                  color: "#fbcfe8",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Tiny edit
              </span>
              <code style={{ fontSize: 12 }}>{message.editApprovalRequest.path}</code>
              <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.85 }}>
                {message.editApprovalRequest.diffPreview.bytesRemoved}b removed,
                {" "}
                {message.editApprovalRequest.diffPreview.bytesAdded}b added
              </span>
            </div>
            <pre
              style={{
                margin: "6px 0",
                padding: "8px 10px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.25)",
                color: "#fce7f3",
                fontSize: 12,
                lineHeight: 1.45,
                overflowX: "auto",
                whiteSpace: "pre",
              }}
            >
              {message.editApprovalRequest.diffPreview.lines.join("\n")}
            </pre>
            <div style={{ marginBottom: 8, fontSize: 12, opacity: 0.85 }}>
              {message.editApprovalRequest.reason || "—"}
            </div>
            {message.editApprovalRequest.state === "pending" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onApproveEdit?.(message.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(244,114,182,0.5)",
                    background: "rgba(244,114,182,0.22)",
                    color: "#fce7f3",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Approve this edit
                </button>
                <button
                  type="button"
                  onClick={() => onDeclineEdit?.(message.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(148,163,184,0.45)",
                    background: "rgba(148,163,184,0.12)",
                    color: "#cbd5e1",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Decline
                </button>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  fontStyle: "italic",
                  color:
                    message.editApprovalRequest.state === "approved"
                      ? "#fce7f3"
                      : "#cbd5e1",
                }}
              >
                {message.editApprovalRequest.state === "approved"
                  ? "Approved. Peh is applying the edit and verifying it now."
                  : "Declined. Nothing was written to disk."}
              </div>
            )}
          </div>
        )}
        {message.role === "assistant" && message.editResult && (
          <div
            role="region"
            aria-label="Tiny edit result"
            style={{
              marginTop: 8,
              padding: "10px 12px",
              borderRadius: 12,
              border:
                message.editResult.status === "applied-verified"
                  ? "1px solid rgba(74,222,128,0.4)"
                  : "1px solid rgba(251,113,133,0.4)",
              background:
                message.editResult.status === "applied-verified"
                  ? "rgba(74,222,128,0.08)"
                  : "rgba(251,113,133,0.08)",
              color:
                message.editResult.status === "applied-verified"
                  ? "#bbf7d0"
                  : "#fecdd3",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <strong>
              {message.editResult.status === "applied-verified"
                ? "Edit applied and verified"
                : message.editResult.status === "applied-rolled-back"
                ? "Edit applied — rolled back after verification failed"
                : "Edit refused"}
            </strong>
            <div style={{ marginTop: 4 }}>{message.editResult.summary}</div>
            {message.editResult.failureReason && (
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
                Reason: {message.editResult.failureReason}
              </div>
            )}
            {message.editResult.checks.length > 0 && (
              <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12 }}>
                {message.editResult.checks.map((c) => (
                  <li key={c.id}>
                    {c.passed ? "✓" : "✗"} {c.description}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {message.role === "assistant" && !isExample && message.text.length > 0 && (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
            }}
            title="Provenance: this reply was generated by the local model only. Peh does not ship any tool execution surface."
          >
            answered by local model only · no tool used · no cloud used
          </div>
        )}
        {message.metrics && (
          <TourHighlight
            target="message-metrics"
            active={activeTarget}
            className="mt-1 inline-block"
          >
            <MetricsRow metrics={message.metrics} />
          </TourHighlight>
        )}
      </div>
    </div>
  );
}

function MetricsRow({ metrics }: { metrics: MessageMetrics }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "4px 6px",
        marginTop: 4,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--text-dim)",
      }}
    >
      <span title="Where the response came from">
        {metrics.source === "local" ? "local" : "cloud"}
      </span>
      <span aria-hidden>·</span>
      <span title="Model that produced this reply">{metrics.model}</span>
      <span aria-hidden>·</span>
      <span title="Wall-clock response time">{formatDuration(metrics.durationMs)}</span>
      <span aria-hidden>·</span>
      <span title="Characters in the reply">{metrics.characterCount} chars</span>
      <span aria-hidden>·</span>
      <span
        title={
          metrics.tokenSource === "approximate"
            ? "Approximate token estimate from text length"
            : "Token count reported by the model"
        }
      >
        {formatTokenCount(metrics)}
      </span>
    </div>
  );
}

function ReceiptsPanel({
  receipts,
  hasMessages,
  streamingInProgress,
  onClearChat,
  onDeleteSession,
  onExportChat,
  sessionTitle,
}: {
  receipts: Receipt[];
  hasMessages: boolean;
  streamingInProgress: boolean;
  onClearChat: () => void;
  onDeleteSession: () => void;
  onExportChat: () => void;
  sessionTitle: string;
}) {
  return (
    <aside
      className="sq-glass"
      style={{
        width: 320,
        maxWidth: "100%",
        padding: 18,
        height: "fit-content",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        Receipts · activity
      </div>
      <h2
        style={{
          marginTop: 6,
          fontFamily: "var(--font-display)",
          fontSize: 18,
          fontWeight: 700,
          color: "var(--text-primary)",
        }}
      >
        What just happened
      </h2>
      <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-dim)" }}>
        A quiet log of model, time, status, and whether cloud or tools were
        used.
      </p>
      <p
        style={{
          marginTop: 10,
          fontSize: 13,
          color: "var(--text-primary)",
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={sessionTitle}
      >
        Current chat: {sessionTitle}
      </p>
      <p
        style={{
          marginTop: 10,
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid var(--border-lit)",
          background: "rgba(7,16,34,0.4)",
          fontSize: 12,
          color: "var(--text-dim)",
        }}
      >
        Your Colloquium chat is saved locally in this browser.
      </p>
      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          onClick={onExportChat}
          disabled={!hasMessages}
          className="sq-btn"
          style={{ fontSize: 12, padding: "6px 12px" }}
        >
          Export chat
        </button>
        <button
          type="button"
          onClick={onClearChat}
          disabled={!hasMessages || streamingInProgress}
          className="sq-btn sq-btn-warn"
          style={{ fontSize: 12, padding: "6px 12px" }}
        >
          Clear chat
        </button>
        <button
          type="button"
          onClick={onDeleteSession}
          disabled={streamingInProgress}
          className="sq-btn sq-btn-warn"
          style={{ fontSize: 12, padding: "6px 12px" }}
        >
          Delete chat
        </button>
      </div>
      {streamingInProgress && (
        <p style={{ marginTop: 8, fontSize: 11, color: "var(--text-dim)" }}>
          Clear chat is available after the current local reply stops.
        </p>
      )}

      {receipts.length === 0 ? (
        <p
          style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px dashed var(--border-lit)",
            background: "rgba(7,16,34,0.36)",
            fontSize: 12,
            color: "var(--text-dim)",
            textAlign: "center",
          }}
        >
          Receipts appear here after you send a message.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "14px 0 0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {receipts
            .slice()
            .reverse()
            .map((r) => (
              <ReceiptRow key={r.id} receipt={r} />
            ))}
        </ul>
      )}
    </aside>
  );
}

function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const dur = receiptDurationMs(receipt);
  const time = new Date(receipt.startedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dotColor =
    receipt.status === "succeeded"
      ? "#4df5c8"
      : receipt.status === "failed"
        ? "#f85149"
        : "#60a5fa";

  return (
    <li
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--border-lit)",
        background: "rgba(7,16,34,0.46)",
        fontSize: 12,
        color: "var(--text-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            boxShadow: `0 0 8px ${dotColor}`,
            animation:
              receipt.status === "running"
                ? "sq-dot-pulse 1.4s ease-in-out infinite"
                : "none",
          }}
        />
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
          {time}
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={receipt.model}
        >
          {receipt.model}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            color: "var(--text-dim)",
          }}
        >
          {receipt.status === "running"
            ? "running…"
            : typeof dur === "number"
              ? formatDuration(dur)
              : ""}
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-dim)",
        }}
      >
        <span>provider: local</span>
        <span aria-hidden>·</span>
        <span>cloud: no</span>
        <span aria-hidden>·</span>
        <span>tools: no</span>
        <span aria-hidden>·</span>
        <span
          style={{
            color:
              receipt.status === "failed"
                ? "#ffb4b4"
                : receipt.status === "succeeded"
                  ? "#7bffdd"
                  : "#9ec5fe",
          }}
        >
          {receipt.status}
        </span>
      </div>
      {receipt.errorMessage && (
        <p style={{ marginTop: 6, fontSize: 11, color: "#ffb4b4" }}>
          {receipt.errorMessage}
        </p>
      )}
    </li>
  );
}

async function readChatError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ChatResponseBody;
    if (body.ok === false) return body.error.message;
  } catch {
    // Fall through to the friendly default.
  }
  return "Peh could not start a local model stream. Check that Ollama is running and the selected model is installed.";
}

async function* readStreamEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseStreamEventLine(line);
        if (event) yield event;
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const event = parseStreamEventLine(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function toStoredMessage(message: UiMessage): StoredConversationMessage[] {
  if (typeof message.createdAt !== "number") return [];
  return [
    {
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
      provider: "local",
      ...(message.model ? { model: message.model } : {}),
      ...(message.receiptId ? { receiptId: message.receiptId } : {}),
      ...(message.metrics ? { metrics: message.metrics } : {}),
    },
  ];
}

function snapshotSession(
  session: StoredChatSession,
  messages: readonly UiMessage[],
  receipts: readonly Receipt[],
): StoredChatSession {
  const storedMessages = messages.flatMap(toStoredMessage);
  const latestMessage = storedMessages[storedMessages.length - 1];
  const latestReceipt = receipts[receipts.length - 1];
  return {
    ...session,
    updatedAt: latestMessage?.createdAt ?? latestReceipt?.completedAt ?? session.updatedAt,
    messages: storedMessages,
    receipts: receipts.slice(-30),
  };
}

function formatSessionTime(value: number): string {
  try {
    return new Date(value).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "local";
  }
}
