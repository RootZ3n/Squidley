/**
 * Presentational badge for a capability decision.
 *
 * Pure render. No fetch, no localStorage, no provider calls. Accepts either
 * a runtime decision or already-shaped ActivityLog receipt metadata; always
 * renders via the same `CapabilityBadgeView` produced by `badges.ts`.
 */

import {
  capabilityBadgeToneClass,
  capabilityDecisionToBadgeView,
  capabilityReceiptMetadataToBadgeView,
  type CapabilityBadgeView,
} from "@/lib/capabilities/badges";
import type { CapabilityRuntimeDecision } from "@/lib/capabilities/runtime";

type CapabilityBadgeProps =
  | { view: CapabilityBadgeView; decision?: never; metadata?: never; showDetail?: boolean; className?: string }
  | { decision: CapabilityRuntimeDecision; view?: never; metadata?: never; showDetail?: boolean; className?: string }
  | {
      metadata: Readonly<Record<string, string | number | boolean>> | null | undefined;
      view?: never;
      decision?: never;
      showDetail?: boolean;
      className?: string;
    };

export function CapabilityBadge(props: CapabilityBadgeProps) {
  const view: CapabilityBadgeView =
    "view" in props && props.view
      ? props.view
      : "decision" in props && props.decision
        ? capabilityDecisionToBadgeView(props.decision)
        : capabilityReceiptMetadataToBadgeView(
            (props as { metadata?: Readonly<Record<string, string | number | boolean>> | null }).metadata,
          );
  const showDetail = props.showDetail ?? false;
  const className = props.className ?? "";

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <span className={capabilityBadgeToneClass(view.tone)}>{view.label}</span>
      <span className="text-xs text-ink-600 dark:text-ink-300">
        {view.shortDescription}
      </span>
      {showDetail && (
        <span className="text-xs text-ink-500 dark:text-ink-400">{view.detail}</span>
      )}
    </span>
  );
}
