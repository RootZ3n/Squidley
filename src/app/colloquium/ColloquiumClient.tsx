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

// ---- Local UI types -------------------------------------------------------

type Role = "user" | "assistant" | "error";

interface LocalHealthState {
  status: LocalHealthStatus;
  endpoint: string;
  modelCount?: number;
  reason?: string;
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
}

const EXAMPLE_MESSAGES: readonly UiMessage[] = [
  { id: "ex-1", role: "user", text: "Hi Squidley — what is this app for?" },
  {
    id: "ex-2",
    role: "assistant",
    text: 'I\'m Squidley. This is Colloquium — Latin for "conversation." We can chat here, and I can teach you the rest of the app as we go.',
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
    text: "Not in local-only mode. The badge near the top of the screen tells you which mode you are in. If we ever connect to a cloud model, the badge changes so you can see it at a glance.",
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
            "Squidley tried to check your local model server, but the check could not complete.",
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
    async (text: string) => {
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
        localChatReady: true,
        providerId: "ollama",
        modelId: selectedModel,
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
          }),
        });
      } catch {
        if (controller.signal.aborted) {
          fail("Stopped before the local model finished replying.");
          return;
        }
        fail(
          "Squidley couldn't reach the local server. Check that it's running, then try again.",
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
        fail("The local model stream stopped before Squidley could finish the reply.");
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
    a.download = `squidley-colloquium-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleReviewInVelum() {
    if (pending || draft.trim().length === 0) return;
    const ok = saveColloquiumToVelumHandoff(window.sessionStorage, draft);
    if (!ok) {
      setImportedDraftNote("Squidley could not prepare this draft for Velum in this browser.");
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
                    ? "Squidley is thinking…"
                    : selectedModel.length === 0
                      ? "Pull a local model with Ollama to start chatting"
                      : "Message Squidley… (Enter to send, Shift+Enter for newline)"
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
        body="Public Squidley uses your local model server here. No cloud fallback is used."
      />
    );
  }

  if (health.status === "ready") {
    return (
      <StatusCallout
        tone="ok"
        title="Local model server ready."
        body={
          typeof health.modelCount === "number"
            ? `${health.modelCount} local model${health.modelCount === 1 ? "" : "s"} found.`
            : "Colloquium will stream replies from your local server."
        }
        hint={
          <>
            {selectionNote ? `${selectionNote} ` : ""}
            {readinessMessage} Public Squidley uses your local model server here, with no cloud fallback.
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
        `Squidley tried to reach your local model server at ${health.endpoint}, but it does not seem to be running.`
      }
      detail={
        <>
          <div>ollama serve</div>
          <div>ollama pull llama3.2</div>
        </>
      }
      hint={
        <>
          Start Ollama or check <code style={{ fontFamily: "var(--font-mono)" }}>SQUIDLEY_LOCAL_ENDPOINT</code>, then refresh models. No cloud fallback is used.
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
    return (
      <InlineCallout
        tone="info"
        title="Squidley found your local model server, but no local models are available yet."
        body={
          modelsReason ??
          "Install one local model, then use Refresh models. Send stays disabled until a local model is available. No cloud fallback will be used."
        }
        detail="ollama pull llama3.2"
      />
    );
  }

  if (health.status === "unavailable") {
    return (
      <InlineCallout
        tone="warn"
        title="Squidley tried to reach your local model server."
        body="Start Ollama, pull a local model if needed, then use Refresh models. Send stays disabled until a local model is ready."
        detail={
          <>
            <div>ollama serve</div>
            <div>ollama pull llama3.2</div>
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
}: {
  message: UiMessage;
  activeTarget: string | null;
  isExample: boolean;
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
          <p style={{ fontWeight: 600 }}>Squidley hit a snag.</p>
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
              Squidley is thinking…
            </span>
          )}
        </div>
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
  return "Squidley could not start a local model stream. Check that Ollama is running and the selected model is installed.";
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
