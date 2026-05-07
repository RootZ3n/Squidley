/**
 * Cloud escalation consent preview panel for Nous.
 *
 * Exercises the consent dialog, receipt orchestration, and gateway policy
 * end-to-end using a real registered capability, without making cloud calls.
 * Granting consent here only records a local decision receipt in Tabularium.
 *
 * No fetch. No provider calls. No cloud calls. No global consent state.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { CloudEscalationConsentDialog } from "./CloudEscalationConsentDialog";
import {
  buildBlockedVelumDemoPacket,
  buildGatewayPolicyDemoPreview,
  buildVelumReviewedDemoPacket,
  GATEWAY_POLICY_DEMO_LABELS,
  type GatewayPolicyDemoMode,
  type GatewayPolicyDemoPreview,
} from "@/lib/capabilities/cloudEscalationDemo";
import {
  recordCloudEscalationOfferAndDecision,
  type CloudConsentOrchestrationResult,
} from "@/lib/capabilities/cloudConsentOrchestration";
import { recordPromptInjectionAssessmentReceipt } from "@/lib/security/promptInjectionReceipts";
import { recordGatewayPolicyDecisionReceipt } from "@/lib/security/gatewayPolicyReceipts";

type VelumMode = "blocked" | "reviewed";

export function CloudEscalationConsentDemo() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [velumMode, setVelumMode] = useState<VelumMode>("blocked");
  const [gatewayPreview, setGatewayPreview] = useState<GatewayPolicyDemoPreview | null>(null);
  const [lastResult, setLastResult] = useState<CloudConsentOrchestrationResult | null>(null);

  const blockedPacket = useMemo(() => buildBlockedVelumDemoPacket(), []);
  const reviewedPacket = useMemo(() => buildVelumReviewedDemoPacket(), []);
  const activePacket = velumMode === "reviewed" ? reviewedPacket : blockedPacket;

  const openVelumDialog = useCallback((m: VelumMode) => {
    setVelumMode(m);
    setGatewayPreview(null);
    setLastResult(null);
    setDialogOpen(true);
  }, []);

  const openGatewayDialog = useCallback((mode: GatewayPolicyDemoMode) => {
    const preview = buildGatewayPolicyDemoPreview(mode, {
      velumReviewPassed: true,
    });
    setGatewayPreview(preview);

    // Record prompt-injection assessment receipt, then policy decision receipt.
    recordPromptInjectionAssessmentReceipt(
      window.localStorage,
      preview.assessment,
    );
    recordGatewayPolicyDecisionReceipt(
      window.localStorage,
      preview.policy,
    );

    if (!preview.policy.allowed) {
      // Policy blocks: record blocked immediately, do not open dialog.
      const packet = buildVelumReviewedDemoPacket();
      const result = recordCloudEscalationOfferAndDecision(
        window.localStorage,
        packet,
        "blocked",
      );
      setLastResult(result);
      setDialogOpen(false);
    } else {
      // Policy allows: open dialog with Velum-reviewed packet.
      setVelumMode("reviewed");
      setLastResult(null);
      setDialogOpen(true);
    }
  }, []);

  const handleGrant = useCallback(() => {
    try {
      const result = recordCloudEscalationOfferAndDecision(
        window.localStorage,
        activePacket,
        "granted",
      );
      setLastResult(result);
    } catch {
      const result = recordCloudEscalationOfferAndDecision(
        window.localStorage,
        activePacket,
        "blocked",
      );
      setLastResult(result);
    }
    setDialogOpen(false);
  }, [activePacket]);

  const handleDeny = useCallback(() => {
    const result = recordCloudEscalationOfferAndDecision(
      window.localStorage,
      activePacket,
      "denied",
    );
    setLastResult(result);
    setDialogOpen(false);
  }, [activePacket]);

  const handleClose = useCallback(() => {
    const result = recordCloudEscalationOfferAndDecision(
      window.localStorage,
      activePacket,
      "cancelled",
    );
    setLastResult(result);
    setDialogOpen(false);
  }, [activePacket]);

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
            onClick={() => openVelumDialog("blocked")}
            className="rounded-lg border border-iris-200 bg-white px-3 py-2 text-sm font-medium text-iris-700 hover:bg-iris-50 dark:border-iris-700/60 dark:bg-ink-900 dark:text-iris-100"
          >
            Preview blocked by Velum
          </button>
          <button
            type="button"
            onClick={() => openVelumDialog("reviewed")}
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
              onClick={() => openGatewayDialog(mode)}
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

      {gatewayPreview && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
          gatewayPreview.policy.allowed
            ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100"
            : gatewayPreview.policy.blockedBy === "velum-required"
              ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100"
              : "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-100"
        }`}>
          {gatewayPreview.statusLine}
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

      <CloudEscalationConsentDialog
        packet={activePacket}
        open={dialogOpen}
        onGrant={handleGrant}
        onDeny={handleDeny}
        onClose={handleClose}
      />
    </div>
  );
}
