/**
 * Approval-Gated Tiny Edit Workflow — public entry.
 *
 * The exported surface here is small and deliberately read-/write-only.
 * There is no exec, no delete, no rename, no multi-file API.
 */

export {
  makeEditApprovalId,
  makeProposalId,
} from "./types";
export type {
  TinyEditApprovalRequest,
  TinyEditCheck,
  TinyEditCheckId,
  TinyEditConfidence,
  TinyEditDiffPreview,
  TinyEditProposal,
  TinyEditReceiptAction,
  TinyEditResult,
  TinyEditRiskLevel,
  TinyEditVerification,
} from "./types";

export { checkEditSafety } from "./safety";
export type {
  CheckEditSafetyOptions,
  EditSafetyError,
  EditSafetyOk,
  EditSafetyReason,
  EditSafetyResult,
} from "./safety";

export { buildDiffPreview } from "./diff";
export type { BuildDiffPreviewArgs } from "./diff";

export {
  TINY_EDIT_APPROVAL_ACTION,
  TINY_EDIT_APPROVAL_TTL_MS,
  buildEditApprovalToken,
  checkEditApproval,
} from "./approval";
export type {
  CheckEditApprovalOptions,
  EditApprovalCheckReason,
  EditApprovalCheckResult,
  EditApprovalError,
  EditApprovalOk,
  TinyEditApprovalToken,
} from "./approval";

export { buildVerification } from "./verifier";
export type { BuildVerificationArgs } from "./verifier";

export {
  applyTinyEdit,
  defaultNodeEditor,
  defaultNodeHasher,
  proposeTinyEdit,
} from "./apply";
export type {
  ApplyTinyEditArgs,
  ContentHasher,
  FileEditor,
  ProposeTinyEditArgs,
} from "./apply";
