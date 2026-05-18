/**
 * Small Model Reliability Layer — public entry point.
 *
 * See docs/SMALL_MODEL_RELIABILITY.md for the architectural overview.
 *
 * Hard invariants for every export below:
 *   - localOnly: true on every result and receipt.
 *   - cloudUsed: false on every result and receipt.
 *   - No fetch is performed in this module. Callers supply IO via the
 *     {@link ToolEnvironment} and {@link ReliabilityModelAction}
 *     interfaces, so tests can run without a live local model.
 */

export {
  DEFAULT_ALLOWED_COMPOUND_TOOLS,
  DEFAULT_RELIABILITY_POLICY,
  createSmallModelTask,
} from "./types";
export type {
  CompoundToolId,
  ReliabilityPolicy,
  ReliabilityResult,
  ReliabilityRiskLevel,
  ReliabilityStep,
  ReliabilityStepKind,
  ReliabilityStepStatus,
  ReliabilityTaskMode,
  SmallModelTask,
} from "./types";

export { packContext, renderPackedContext } from "./contextPacker";
export type {
  ContextItem,
  ContextItemKind,
  PackContextOptions,
  PackedContext,
  PackedContextItem,
} from "./contextPacker";

export {
  COMPOUND_TOOL_REGISTRY,
  explainProjectStructure,
  getCompoundTool,
  inspectOneFileSafely,
  makeSmallTextChangeAndVerify,
  runLocalHealthCheck,
  summarizeErrorAndNextStep,
} from "./compoundTools";
export type {
  CompoundToolDescriptor,
  CompoundToolResult,
  DirEntry,
  ErrorContext,
  InspectFileArgs,
  LocalHealthReport,
  SmallTextChangeArgs,
  ToolEnvironment,
} from "./compoundTools";

export { buildFailureSignature, decomposeTask } from "./decompose";
export type { DecompositionResult, SuggestedSubTask } from "./decompose";

export {
  buildCloudPacketPreviewedReceipt,
  buildConsentDecisionReceipt,
  buildEscalationOffer,
  buildEscalationOfferedReceipt,
  buildEscalationTimelineNoConsent,
  buildLocalFailedReceipt,
} from "./escalation";
export type {
  BuildEscalationOfferInput,
  EscalationConsentState,
  EscalationEventKind,
  EscalationOffer,
  EscalationReceiptEvent,
} from "./escalation";

export {
  countStepsOfKind,
  defaultValidator,
  runReliability,
  summarizeEscalationEvents,
} from "./runner";
export type {
  ReliabilityModelAction,
  ReliabilityModelOutcome,
  ReliabilityValidator,
  RunReliabilityOptions,
} from "./runner";

export {
  HEAVY_DIRS_TO_IGNORE,
  indexCodeGraph,
  queryCodeGraph,
} from "./codeGraph";
export type {
  CodeGraphIndexOptions,
  CodeGraphIndexer,
  CodeGraphNode,
  CodeGraphNodeKind,
  CodeGraphQuery,
  CodeGraphSummary,
} from "./codeGraph";

export {
  RELIABILITY_HEADLINES,
  RELIABILITY_PLAIN_LANGUAGE,
  buildReliabilityIntroCard,
  summarizeReliabilityResultForBeginner,
} from "./copy";
export type { ReliabilityCard } from "./copy";

// File-inspection (read-only, approval-gated)
export {
  ALLOWED_INSPECT_EXTENSIONS,
  BLOCKED_DIR_SEGMENTS,
  FILE_INSPECTION_SAFETY_RULES,
  MAX_INSPECT_FILE_BYTES,
  checkInspectPath,
} from "./fileSafety";
export type {
  CheckPathOptions,
  PathSafetyError,
  PathSafetyOk,
  PathSafetyReason,
  PathSafetyResult,
} from "./fileSafety";

export {
  SECRET_REDACTION_DISCLAIMER,
  redactSecrets,
} from "./secretRedaction";
export type {
  RedactionApplied,
  RedactionResult,
  SecretRedactionCategory,
} from "./secretRedaction";

export {
  FILE_APPROVAL_ACTION,
  FILE_APPROVAL_TTL_MS,
  buildFileInspectionApproval,
  checkFileInspectionApproval,
} from "./fileApproval";
export type {
  ApprovalCheckOptions,
  ApprovalCheckResult,
  ApprovalError,
  ApprovalOk,
  FileInspectionApproval,
} from "./fileApproval";

export {
  resolveInspectionRoot,
  safeFileInspect,
} from "./safeFileInspection";
export type {
  FileInspectionReader,
  FileInspectionReceiptAction,
  InspectFileOptions,
  InspectionApprovalRequest,
  InspectionOutcome,
  InspectionOutcomeStatus,
} from "./safeFileInspection";
