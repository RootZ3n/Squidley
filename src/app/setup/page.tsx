"use client";

import { useState, useEffect, useCallback } from "react";

/* ────────────────────────────────────────────────────────────────────────
   Peh Public — First-Run Setup Page

   Guides beginners through:
   1. Welcome / what is local-first
   2. Ollama detection
   3. Install guidance (OS-specific)
   4. Model pull guidance
   5. Smoke verification
   6. "You are ready" screen

   Works in both dev mode and Electron packaging.
   ──────────────────────────────────────────────────────────────────────── */

type Step = "welcome" | "detect" | "install" | "model" | "verify" | "ready";

interface HealthStatus {
  ollamaUp: boolean;
  models: string[];
  checking: boolean;
  error: string | null;
}

function detectOS(): "windows" | "macos" | "linux" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

const INSTALL_INSTRUCTIONS: Record<string, { title: string; steps: string[] }> =
  {
    windows: {
      title: "Install Ollama on Windows",
      steps: [
        "1. Download the Ollama installer from ollama.com/download",
        "2. Run the installer (.exe) — no admin required",
        "3. Ollama starts automatically after install",
        '4. Click "Verify" below when done',
      ],
    },
    macos: {
      title: "Install Ollama on macOS",
      steps: [
        "1. Download the Ollama app from ollama.com/download",
        "2. Open the .dmg and drag Ollama to Applications",
        "3. Launch Ollama from Applications",
        '4. Click "Verify" below when done',
      ],
    },
    linux: {
      title: "Install Ollama on Linux",
      steps: [
        "1. Open a terminal and run:",
        "   curl -fsSL https://ollama.com/install.sh | sh",
        "2. Start Ollama:",
        "   ollama serve",
        '3. Click "Verify" below when done',
      ],
    },
    unknown: {
      title: "Install Ollama",
      steps: [
        "1. Visit ollama.com/download for your platform",
        "2. Follow the install instructions",
        "3. Start Ollama",
        '4. Click "Verify" below when done',
      ],
    },
  };

export default function SetupPage() {
  const [step, setStep] = useState<Step>("welcome");
  const [os, setOs] = useState<string>("unknown");
  const [health, setHealth] = useState<HealthStatus>({
    ollamaUp: false,
    models: [],
    checking: false,
    error: null,
  });
  const [smokeResult, setSmokeResult] = useState<string | null>(null);
  const [smokeLoading, setSmokeLoading] = useState(false);

  useEffect(() => {
    setOs(detectOS());
  }, []);

  const checkHealth = useCallback(async () => {
    setHealth((h) => ({ ...h, checking: true, error: null }));
    try {
      const [healthRes, modelsRes] = await Promise.all([
        fetch("/api/local/health"),
        fetch("/api/local/models"),
      ]);
      const healthData = await healthRes.json();
      const modelsData = await modelsRes.json();
      const models: string[] = Array.isArray(modelsData.models)
        ? modelsData.models.map((m: { name?: string }) => m.name ?? "unknown")
        : [];
      setHealth({
        ollamaUp: healthData.status === "ok",
        models,
        checking: false,
        error: null,
      });
    } catch {
      setHealth({
        ollamaUp: false,
        models: [],
        checking: false,
        error: "Could not reach Peh server. Is it running?",
      });
    }
  }, []);

  // Auto-detect on the detect step
  useEffect(() => {
    if (step === "detect") {
      checkHealth();
    }
  }, [step, checkHealth]);

  const runSmoke = async () => {
    setSmokeLoading(true);
    setSmokeResult(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Say hello in one sentence." }],
        }),
      });
      if (!res.ok) {
        setSmokeResult(`Error: ${res.status} ${res.statusText}`);
      } else {
        const data = await res.json();
        setSmokeResult(data.reply ?? data.content ?? "Got a response!");
      }
    } catch (err) {
      setSmokeResult(
        `Failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setSmokeLoading(false);
    }
  };

  const markComplete = () => {
    // In Electron, this would also write the setup-complete flag.
    // In browser, just navigate to the main app.
    window.location.href = "/chat";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="sq-glass max-w-2xl w-full p-8 space-y-6">
        {/* ── Welcome ───────────────────────────────────── */}
        {step === "welcome" && (
          <div className="space-y-4">
            <h1
              className="text-3xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Welcome to Peh
            </h1>
            <p className="text-[var(--text-dim)] leading-relaxed">
              Peh is a <strong>local-first</strong> AI workspace. Your
              conversations, notes, and data stay on your machine. Nothing is
              sent to the cloud unless you explicitly allow it.
            </p>
            <p className="text-[var(--text-dim)] leading-relaxed">
              To get started, Peh needs a local AI model running on your
              computer. We will guide you through setting that up.
            </p>
            <button
              className="sq-btn sq-btn-primary px-6 py-3 text-lg"
              onClick={() => setStep("detect")}
            >
              Get Started
            </button>
          </div>
        )}

        {/* ── Detect ────────────────────────────────────── */}
        {step === "detect" && (
          <div className="space-y-4">
            <h2
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Checking Your Setup
            </h2>

            {health.checking && (
              <p className="text-[var(--text-dim)]">
                Looking for a local model server...
              </p>
            )}

            {!health.checking && health.ollamaUp && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[var(--accent-chat)]" />
                  <span>Ollama is running</span>
                </div>
                {health.models.length > 0 ? (
                  <>
                    <p className="text-[var(--text-dim)]">
                      Models found: {health.models.join(", ")}
                    </p>
                    <button
                      className="sq-btn sq-btn-primary px-6 py-3"
                      onClick={() => setStep("verify")}
                    >
                      Continue to Verify
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[var(--text-dim)]">
                      Ollama is running but no models are installed yet.
                    </p>
                    <button
                      className="sq-btn sq-btn-primary px-6 py-3"
                      onClick={() => setStep("model")}
                    >
                      Install a Model
                    </button>
                  </>
                )}
              </div>
            )}

            {!health.checking && !health.ollamaUp && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <span>No local model server detected</span>
                </div>
                {health.error && (
                  <p className="text-red-400 text-sm">{health.error}</p>
                )}
                <p className="text-[var(--text-dim)]">
                  Peh needs Ollama to run AI models locally.
                </p>
                <div className="flex gap-3">
                  <button
                    className="sq-btn sq-btn-primary px-6 py-3"
                    onClick={() => setStep("install")}
                  >
                    Install Ollama
                  </button>
                  <button
                    className="sq-btn px-6 py-3"
                    onClick={checkHealth}
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Install ───────────────────────────────────── */}
        {step === "install" && (
          <div className="space-y-4">
            <h2
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {INSTALL_INSTRUCTIONS[os]?.title ?? "Install Ollama"}
            </h2>
            <div className="bg-[var(--bg-deep)] rounded-lg p-4 space-y-1 font-mono text-sm">
              {(INSTALL_INSTRUCTIONS[os]?.steps ?? []).map((line, i) => (
                <p key={i} className="text-[var(--text-dim)]">
                  {line}
                </p>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                className="sq-btn sq-btn-primary px-6 py-3"
                onClick={() => setStep("detect")}
              >
                Verify
              </button>
              <button
                className="sq-btn px-6 py-3"
                onClick={() => setStep("detect")}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* ── Model Pull ────────────────────────────────── */}
        {step === "model" && (
          <div className="space-y-4">
            <h2
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Pull Your First Model
            </h2>
            <p className="text-[var(--text-dim)]">
              Open a terminal and run:
            </p>
            <div className="bg-[var(--bg-deep)] rounded-lg p-4 font-mono text-sm">
              <code className="text-[var(--accent-chat)] select-all">
                ollama pull llama3.2
              </code>
            </div>
            <p className="text-[var(--text-dim)] text-sm">
              This downloads a ~2 GB model. It may take a few minutes depending
              on your connection.
            </p>
            <div className="flex gap-3">
              <button
                className="sq-btn sq-btn-primary px-6 py-3"
                onClick={() => setStep("detect")}
              >
                Verify
              </button>
              <button
                className="sq-btn px-6 py-3"
                onClick={() => setStep("detect")}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* ── Verify ────────────────────────────────────── */}
        {step === "verify" && (
          <div className="space-y-4">
            <h2
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Test Your Setup
            </h2>
            <p className="text-[var(--text-dim)]">
              Let&apos;s make sure everything works. Click below to send a quick
              test message to your local model.
            </p>
            <button
              className="sq-btn sq-btn-primary px-6 py-3"
              onClick={runSmoke}
              disabled={smokeLoading}
            >
              {smokeLoading ? "Testing..." : "Run Quick Test"}
            </button>
            {smokeResult && (
              <div className="bg-[var(--bg-deep)] rounded-lg p-4">
                <p className="text-sm font-mono text-[var(--text-dim)]">
                  {smokeResult}
                </p>
              </div>
            )}
            {smokeResult && !smokeResult.startsWith("Error") && !smokeResult.startsWith("Failed") && (
              <button
                className="sq-btn sq-btn-primary px-6 py-3"
                onClick={() => setStep("ready")}
              >
                Continue
              </button>
            )}
            <button
              className="sq-btn px-6 py-3"
              onClick={() => setStep("detect")}
            >
              Back
            </button>
          </div>
        )}

        {/* ── Ready ─────────────────────────────────────── */}
        {step === "ready" && (
          <div className="space-y-4">
            <h2
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              You&apos;re Ready!
            </h2>
            <p className="text-[var(--text-dim)] leading-relaxed">
              Peh is set up and connected to your local model. Everything
              runs on your machine — your conversations, notes, and data stay
              local.
            </p>
            <div className="bg-[var(--bg-deep)] rounded-lg p-4 space-y-2 text-sm">
              <p className="text-[var(--text-dim)]">
                <strong className="text-[var(--text-primary)]">
                  Receipts:
                </strong>{" "}
                Check ActivityLog to see what happened and what stayed local.
              </p>
              <p className="text-[var(--text-dim)]">
                <strong className="text-[var(--text-primary)]">
                  No cloud:
                </strong>{" "}
                Cloud features are locked by default. You control what leaves
                your machine.
              </p>
              <p className="text-[var(--text-dim)]">
                <strong className="text-[var(--text-primary)]">
                  Browser storage:
                </strong>{" "}
                Your data lives in this browser. Clearing browser data clears
                Peh data.
              </p>
            </div>
            <button
              className="sq-btn sq-btn-primary px-8 py-4 text-lg"
              onClick={markComplete}
            >
              Open Peh
            </button>
          </div>
        )}

        {/* ── Step indicator ────────────────────────────── */}
        <div className="flex justify-center gap-2 pt-4">
          {(
            ["welcome", "detect", "install", "model", "verify", "ready"] as Step[]
          ).map((s) => (
            <div
              key={s}
              className="w-2 h-2 rounded-full transition-colors"
              style={{
                backgroundColor:
                  s === step
                    ? "var(--accent-chat)"
                    : "var(--border-lit)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
