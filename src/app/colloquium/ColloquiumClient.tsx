"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CompanionTourPanel } from "@/components/CompanionTourPanel";
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

// ---- Local UI types -------------------------------------------------------

type Role = "user" | "assistant" | "error";

interface UiMessage {
  id: string;
  role: Role;
  text: string;
  metrics?: MessageMetrics;
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
  const [modelChoice, setModelChoice] = useState<"default">("default");

  const tour = useMemo(() => getTour("colloquium")!, []);
  const showingExamples = messages.length === 0;
  const visibleMessages = showingExamples ? EXAMPLE_MESSAGES : messages;
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // Restore tour intent from query param or persisted preference.
  useEffect(() => {
    const fromQuery = params.get("tour") === "1";
    const fromStorage = readTourMode() === "on";
    setTourActive(fromQuery || fromStorage);
  }, [params]);

  // Auto-scroll the chat thread to the bottom when content grows.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, pending]);

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

  // ---- Send ---------------------------------------------------------------
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || pending) return;

      const userMsg: UiMessage = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "user",
        text: trimmed,
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
      const startedAt = Date.now();
      const runningReceipt = createRunningReceipt({
        id: receiptId,
        model: "(starting…)",
        startedAt,
      });

      setMessages((prev) => [...prev, userMsg]);
      setReceipts((prev) => upsertReceipt(prev, runningReceipt));
      setPending(true);
      setDraft("");

      const fail = (message: string) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "error",
            text: message,
          },
        ]);
        setReceipts((prev) =>
          upsertReceipt(prev, failReceipt(runningReceipt, Date.now(), message)),
        );
        setPending(false);
      };

      let response: Response;
      try {
        response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history,
            // model: undefined → server uses its configured default
          }),
        });
      } catch {
        fail(
          "Squidley couldn't reach the local server. Check that it's running, then try again.",
        );
        return;
      }

      let body: ChatResponseBody;
      try {
        body = (await response.json()) as ChatResponseBody;
      } catch {
        fail("The local server replied, but the response wasn't valid JSON.");
        return;
      }

      if (body.ok !== true) {
        fail(body.error.message);
        return;
      }

      const metrics = buildLocalMessageMetrics({
        model: body.model,
        reply: body.reply,
        durationMs: body.durationMs,
        modelReportedTokens: body.evalCount,
      });
      const assistantMsg: UiMessage = {
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        text: body.reply.length > 0 ? body.reply : "(empty reply)",
        metrics,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setReceipts((prev) =>
        upsertReceipt(
          prev,
          succeedReceipt(
            { ...runningReceipt, model: body.model },
            body.completedAt,
          ),
        ),
      );
      setPending(false);
    },
    [messages, pending],
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

  // ---- Render -------------------------------------------------------------

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-4 dark:border-ink-700">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl font-semibold text-ink-900 dark:text-ink-50">
              Colloquium
            </h1>
            <span className="rounded-full bg-iris-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-iris-700 dark:bg-iris-900/40 dark:text-iris-200">
              Chat
            </span>
          </div>
          <p className="text-xs text-ink-500 dark:text-ink-300">
            Latin for &ldquo;conversation, discussion.&rdquo;
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TourHighlight target="local-only-indicator" active={activeTarget}>
            <span
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200"
              title="Local-only · nothing leaves this device"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Local-only
            </span>
          </TourHighlight>

          <TourHighlight target="model-selector" active={activeTarget}>
            <label className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-700 shadow-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100">
              <span className="text-ink-400">Model</span>
              <select
                aria-label="Model & provider"
                className="bg-transparent text-xs focus:outline-none"
                value={modelChoice}
                onChange={(e) => setModelChoice(e.target.value as "default")}
              >
                <option value="default">Local · default</option>
                <option value="other" disabled>
                  Other (coming soon)
                </option>
              </select>
            </label>
          </TourHighlight>

          <button
            type="button"
            onClick={handleRestartTour}
            className="rounded-lg border border-iris-200 bg-white px-3 py-1.5 text-xs font-medium text-iris-700 shadow-sm transition hover:border-iris-300 hover:bg-iris-50 focus:outline-none focus:ring-2 focus:ring-iris-300 dark:border-iris-700/60 dark:bg-ink-800 dark:text-iris-200 dark:hover:bg-ink-700"
            aria-label="Restart the Colloquium tour"
          >
            ↻ Restart tour
          </button>

          <Link
            href="/modules"
            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100 dark:hover:bg-ink-700"
          >
            Modules
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="mt-4 flex flex-1 flex-col gap-4 lg:flex-row">
        {/* Chat */}
        <section className="flex flex-1 flex-col">
          <TourHighlight
            target="chat-thread"
            active={activeTarget}
            className="flex flex-1 flex-col gap-3 overflow-y-auto p-2"
          >
            {showingExamples && <ExampleHeader />}
            {visibleMessages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                activeTarget={activeTarget}
                isExample={showingExamples}
              />
            ))}
            {pending && <ThinkingBubble />}
            <div ref={threadEndRef} />
          </TourHighlight>

          <TourHighlight target="input-box" active={activeTarget} className="mt-3">
            <form
              onSubmit={handleSubmit}
              className="flex items-end gap-2 rounded-2xl border border-ink-200 bg-white p-2 shadow-sm dark:border-ink-700 dark:bg-ink-800"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                placeholder={
                  pending
                    ? "Squidley is thinking…"
                    : "Message Squidley… (Enter to send, Shift+Enter for newline)"
                }
                rows={2}
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none disabled:opacity-60 dark:text-ink-50"
              />
              <button
                type="submit"
                className="h-9 rounded-lg bg-squid-600 px-4 text-sm font-medium text-white hover:bg-squid-700 focus:outline-none focus:ring-2 focus:ring-squid-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending || draft.trim().length === 0}
                aria-busy={pending}
              >
                {pending ? "Sending…" : "Send"}
              </button>
            </form>
          </TourHighlight>
        </section>

        {/* Receipts */}
        <TourHighlight
          target="receipts"
          active={activeTarget}
          className="lg:w-80"
        >
          <ReceiptsPanel receipts={receipts} />
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
    </main>
  );
}

// ---- Subcomponents --------------------------------------------------------

function ExampleHeader() {
  return (
    <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-3 text-center text-xs text-ink-500 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-300">
      <p>
        <span className="font-medium">Example conversation.</span> This is what
        Colloquium looks like — it will be replaced with your own chat once you
        send a message.
      </p>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl border border-ink-200 bg-white px-4 py-2.5 text-sm italic text-ink-500 shadow-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">
        <span className="motion-safe:animate-pulse">Squidley is thinking…</span>
      </div>
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
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 shadow-sm dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
          <p className="font-medium">Squidley hit a snag.</p>
          <p className="mt-1 text-amber-800 dark:text-amber-200">{message.text}</p>
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Tip: see <code className="font-mono">docs/LOCAL_CHAT.md</code> for setup help.
          </p>
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%]">
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
            isUser
              ? "bg-squid-600 text-white"
              : "bg-white text-ink-800 dark:bg-ink-800 dark:text-ink-50"
          } ${isExample ? "opacity-80" : ""}`}
        >
          {message.text}
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
    <div className="flex flex-wrap items-center gap-2 px-1 text-[10px] uppercase tracking-wide text-ink-400">
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

function ReceiptsPanel({ receipts }: { receipts: Receipt[] }) {
  return (
    <aside className="h-full rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
      <h2 className="text-sm font-semibold text-ink-700 dark:text-ink-100">
        Receipts &amp; activity
      </h2>
      <p className="mt-1 text-xs text-ink-400">
        A quiet log of what just happened — model, time, status, and whether
        cloud or tools were used.
      </p>

      {receipts.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-ink-200 bg-ink-50/60 px-3 py-4 text-center text-xs text-ink-400 dark:border-ink-700 dark:bg-ink-900/40">
          Receipts appear here after you send a message.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
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
  const dot =
    receipt.status === "succeeded"
      ? "bg-emerald-500"
      : receipt.status === "failed"
        ? "bg-amber-500"
        : "bg-squid-500 motion-safe:animate-pulse";

  return (
    <li className="rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2 text-xs text-ink-700 dark:border-ink-700/60 dark:bg-ink-900/40 dark:text-ink-200">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        <span className="font-mono text-[11px] text-ink-500">{time}</span>
        <span className="truncate" title={receipt.model}>
          {receipt.model}
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-500">
          {receipt.status === "running"
            ? "running…"
            : typeof dur === "number"
              ? formatDuration(dur)
              : ""}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wide text-ink-400">
        <span>provider: local</span>
        <span aria-hidden>·</span>
        <span>cloud: no</span>
        <span aria-hidden>·</span>
        <span>tools: no</span>
        <span aria-hidden>·</span>
        <span
          className={
            receipt.status === "failed"
              ? "text-amber-700 dark:text-amber-300"
              : receipt.status === "succeeded"
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-squid-700 dark:text-squid-300"
          }
        >
          {receipt.status}
        </span>
      </div>
      {receipt.errorMessage && (
        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
          {receipt.errorMessage}
        </p>
      )}
    </li>
  );
}
