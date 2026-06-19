/**
 * Presentational consent dialog shell for cloud escalation offers.
 *
 * Pure render. No fetch, no localStorage, no provider calls, no cloud calls.
 * Buttons only fire callbacks. Nothing is sent merely because this dialog
 * is rendered.
 */

import type { CloudEscalationPacket } from "@/lib/capabilities/cloudEscalation";
import { cloudEscalationPacketToDialogView } from "@/lib/capabilities/cloudEscalationDisplay";

export interface CloudEscalationConsentDialogProps {
  packet: CloudEscalationPacket;
  open: boolean;
  onGrant: () => void;
  onDeny: () => void;
  onClose?: () => void;
  disabled?: boolean;
  titleOverride?: string;
  compact?: boolean;
}

export function CloudEscalationConsentDialog({
  packet,
  open,
  onGrant,
  onDeny,
  onClose,
  disabled = false,
  titleOverride,
  compact = false,
}: CloudEscalationConsentDialogProps) {
  if (!open) return null;

  const view = cloudEscalationPacketToDialogView(packet);
  const grantDisabled = disabled || !view.canGrant;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titleOverride ?? view.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 dark:bg-ink-950/60"
    >
      <div className="w-full max-w-lg rounded-2xl border border-ink-200 bg-white p-5 shadow-xl dark:border-ink-700 dark:bg-ink-800">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-ink-50">
            {titleOverride ?? view.title}
          </h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-ink-400 hover:text-ink-700 dark:hover:text-ink-100"
              aria-label="Close"
            >
              Close
            </button>
          )}
        </div>

        <p className="mt-3 text-sm leading-6 text-ink-700 dark:text-ink-200">
          {view.beginnerExplanation}
        </p>

        {!compact && (
          <p className="mt-2 text-xs leading-5 text-ink-500 dark:text-ink-400">
            {view.reason}
          </p>
        )}

        <div className="mt-4 space-y-3">
          <DialogField label="Capability" value={view.capabilityId} />
          <DialogField label="Consent" value={view.consentStateLabel} />
          {view.dataCategoryLabels.length > 0 && (
            <DialogField
              label="Data that would be sent"
              value={view.dataCategoryLabels.join(", ")}
            />
          )}
          {view.providerProfileLabels.length > 0 && (
            <DialogField
              label="Cloud provider needed"
              value={view.providerProfileLabels.join(", ")}
            />
          )}
          {view.velumLine && <DialogField label="Velum review" value={view.velumLine} />}
          {view.blockedLines.length > 0 && (
            <DialogField
              label="Blocked"
              value={view.blockedLines.join("; ")}
            />
          )}
        </div>

        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100">
          {view.nothingSentLine}
        </p>

        {view.grantDisabledReason && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">
            {view.grantDisabledReason}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGrant}
            disabled={grantDisabled}
            className="rounded-lg bg-iris-600 px-4 py-2 text-sm font-medium text-white hover:bg-iris-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-iris-500 dark:hover:bg-iris-600"
          >
            {view.grantButtonLabel}
          </button>
          <button
            type="button"
            onClick={onDeny}
            disabled={disabled}
            className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
          >
            {view.denyButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DialogField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2 dark:border-ink-700/60 dark:bg-ink-900/40">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink-700 dark:text-ink-200">{value}</dd>
    </div>
  );
}
