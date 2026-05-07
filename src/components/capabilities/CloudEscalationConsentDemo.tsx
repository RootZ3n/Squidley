/**
 * Cloud escalation consent preview panel for Nous.
 *
 * Exercises the consent dialog, receipt orchestration, and gateway policy
 * end-to-end using a real registered capability, without making cloud calls.
 * Uses runGuardedCloudEscalationPreflight as the canonical preflight path.
 * Granting consent here only records a local decision receipt in Tabularium.
 *
 * No fetch. No provider calls. No cloud calls. No global consent state.
 */

"use client";

import { useCallback, useState } from "react";
import { CloudEscalationConsentDialog } from "./CloudEscalationConsentDialog";
import {
  runDemoGuardedPreflight,
  GATEWAY_POLICY_DEMO_LABELS,
  type DemoPreflightMode,
  type DemoPreflightResult,
  type GatewayPolicyDemoMode,
} from "@/lib/capabilities/cloudEscalationDemo";
import {
  recordCloudConsentDecisionOnly,
} from "@/lib/capabilities/cloudConsentOrchestration";
import type { CloudConsentDecision } from "@/lib/capabilities/cloudConsentReceipts";

interface DemoLastResult {
  decision: string;
  offerRecorded: boolean;
  decisionRecorded: boolean;
  nothingSentYet: true;
  errors: string[];
}

export function CloudEscalationConsentDemo() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentPreflight, setCurrentPreflight] = useState<DemoPreflightResult | null>(null);
  const [lastResult, setLastResult] = useState<DemoLastResult | null>(null);

  const activePacket = currentPreflight?.preflight.escalationPacket ?? null;

  const recordDecision = useCallback(
    (decision: CloudConsentDecision) => {
      if (!activePacket) return;
      try {
        const receipt = recordCloudConsentDecisionOnly(
          window.localStorage,
          activePacket,
          decision,
        );
        setLastResult({
          decision,
          offerRecorded: currentPreflight?.preflight.receipts.offerReceipt !== null ?? false,
          decisionRecorded: receipt !== null,
          nothingSentYet: true,
          errors: receipt ? [] : ["Decision receipt write returned null."],
        });
      } catch {
        // Grant threw (e.g. Velum not passed) — record blocked instead.
        try {
          const receipt = recordCloudConsentDecisionOnly(
            window.localStorage,
            activePacket,
            "blocked",
          );
          setLastResult({
            decision: "blocked",
            offerRecorded: currentPreflight?.preflight.receipts.offerReceipt !== null ?? false,
            decisionRecorded: receipt !== null,
            nothingSentYet: true,
            errors: [],
          });
        } catch {
          setLastResult({
            decision: "blocked",
            offerRecorded: currentPreflight?.preflight.receipts.offerReceipt !== null ?? false,
            decisionRecorded: false,
            nothingSentYet: true,
            errors: ["Decision receipt failed."],
          });
        }
      }
      setDialogOpen(false);
    },
    [activePacket, currentPreflight],
  );

  // Velum preview: run preflight, always open dialog to demo the state.
  const openVelumPreview = useCallback((blocked: boolean) => {
    const mode: DemoPreflightMode = blocked ? "velum-blocked" : "velum-reviewed";
    const result = runDemoGuardedPreflight(mode, {
      storage: window.localStorage,
      recordReceipts: true,
    });
    setCurrentPreflight(result);
    setLastResult(null);
    setDialogOpen(true);
  }, []);

  // Gateway preview: run preflight, open dialog only if allowed.
  const openGatewayPreview = useCallback((gatewayMode: GatewayPolicyDemoMode) => {
    const result = runDemoGuardedPreflight(gatewayMode, {
      storage: window.localStorage,
      recordReceipts: true,
    });
    setCurrentPreflight(result);

    if (result.preflight.allowedToOfferCloud) {
      setLastResult(null);
      setDialogOpen(true);
    } else {
      // Policy blocks: record blocked decision, do not open dialog.
      const packet = result.preflight.escalationPacket;
      if (packet) {
        try {
          const receipt = recordCloudConsentDecisionOnly(
            window.localStorage,
            packet,
            "blocked",
          );
          setLastResult({
            decision: "blocked",
            offerRecorded: result.preflight.receipts.offerReceipt !== null,
            decisionRecorded: receipt !== null,
            nothingSentYet: true,
            errors: receipt ? [] : ["Decision receipt write returned null."],
          });
        } catch {
          setLastResult({
            decision: "blocked",
            offerRecorded: result.preflight.receipts.offerReceipt !== null,
            decisionRecorded: false,
            nothingSentYet: true,
            errors: ["Decision receipt failed."],
          });
        }
      }
      setDialogOpen(false);
    }
  }, []);

  const handleGrant = useCallback(() => recordDecision("granted"), [recordDecision]);
  const handleDeny = useCallback(() => recordDecision("denied"), [recordDecision]);
  const handleClose = useCallback(() => recordDecision("cancelled"), [recordDecision]);

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-700 dark:bg-ink-800">
      <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
        Cloud escalation consent preview
      </h2>
      <p className="mt-1 text-xs text-ink-400">
        This is a local-only consent preview. No cloud call will be made.
        Gateway policy only controls whether the consent dialog can proceed.
      </p>

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Velum state</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openVelumPreview(true)}
            className="rounded-lg border border-iris-200 bg-white px-3 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
          >
            Preview blocked by Velum
          </button>
          <button
            type="button"
            onClick={() => openVelumPreview(false)}
            className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/60 dark:bg-ink-900 dark:text-emerald-100"
          >
            Preview after Velum review
          </button>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Gateway policy preview</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(["clean", "suspicious", "injection"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => openGatewayPreview(mode)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                mode === "clean"
                  ? "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700/60 dark:bg-ink-900 dark:text-emerald-100"
                  : mode === "suspicious"
                    ? "border-amber-200 bg-white text-amber-700 hover:bg-amber-50 dark:border-amber-700/60 dark:bg-ink-900 dark:text-amber-100"
                    : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-700/60 dark:bg-ink-900 dark:text-rose-100"
              }`}
            >
              {GATEWAY_POLICY_DEMO_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {currentPreflight && !dialogOpen && currentPreflight.mode !== "velum-blocked" && currentPreflight.mode !== "velum-reviewed" && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
          currentPreflight.preflight.allowedToOfferCloud
            ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100"
            : currentPreflight.preflight.blockedBy === "velum-required"
              ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100"
              : "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-100"
        }`}>
          {currentPreflight.statusLine}
        </p>
      )}

      {lastResult && (
        <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/70 p-3 text-xs dark:border-ink-700/60 dark:bg-ink-900/40">
          <p className="font-medium text-ink-700 dark:text-ink-200">
            Last decision: {lastResult.decision}
          </p>
          <p className="mt-1 text-ink-500 dark:text-ink-300">
            Offer recorded: {String(lastResult.offerRecorded)} · Decision recorded: {String(lastResult.decisionRecorded)}
          </p>
          <p className="mt-1 text-ink-400">
            Nothing sent: {String(lastResult.nothingSentYet)} · Check Tabularium to see the receipts.
          </p>
          {lastResult.errors.length > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-200">
              Errors: {lastResult.errors.join("; ")}
            </p>
          )}
        </div>
      )}

      {activePacket && (
        <CloudEscalationConsentDialog
          packet={activePacket}
          open={dialogOpen}
          onGrant={handleGrant}
          onDeny={handleDeny}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
