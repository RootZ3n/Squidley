import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type LocalGauntletStatus = "PASS" | "TRY_VERIFY" | "NEEDS_CLOUD" | "BLOCKED";

export interface LocalGauntletStatusSummary {
  PASS: number;
  TRY_VERIFY: number;
  NEEDS_CLOUD: number;
  BLOCKED: number;
}

export interface LocalGauntletTaskSummary {
  id: string;
  label: string;
  status: LocalGauntletStatus;
  reason: string;
  durationMs?: number;
}

export interface LocalGauntletReportSummary {
  schemaVersion: 1;
  fileName: string;
  backend: string;
  model: string;
  modelKey: string;
  localOnly: true;
  cloudUsed: false;
  overall: LocalGauntletStatus;
  statusSummary: LocalGauntletStatusSummary;
  startedAt: string;
  completedAt: string;
  durationMs?: number;
  taskResults: LocalGauntletTaskSummary[];
  warning: "Narrow local smoke only, not a benchmark or proof of full safety.";
}

export interface LocalGauntletRejectedReport {
  fileName: string;
  reason: string;
}

export interface LocalGauntletReportIndex {
  reportsDir: string;
  generatedAt: string;
  latestByModelBackend: LocalGauntletReportSummary[];
  acceptedReports: number;
  rejectedReports: LocalGauntletRejectedReport[];
  warning: "Gauntlet PASS is not proof that a model is safe or generally capable.";
}

const REPORTS_RELATIVE_DIR = ["reports", "local-model-gauntlet"] as const;
const VALID_STATUSES = new Set<LocalGauntletStatus>(["PASS", "TRY_VERIFY", "NEEDS_CLOUD", "BLOCKED"]);

export function localGauntletReportsDir(rootDir = process.cwd()): string {
  return join(rootDir, ...REPORTS_RELATIVE_DIR);
}

export async function readLocalGauntletReportIndex(rootDir = process.cwd()): Promise<LocalGauntletReportIndex> {
  const reportsDir = localGauntletReportsDir(rootDir);
  let fileNames: string[];
  try {
    fileNames = (await readdir(reportsDir))
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch {
    return emptyIndex(reportsDir);
  }

  const accepted: LocalGauntletReportSummary[] = [];
  const rejectedReports: LocalGauntletRejectedReport[] = [];

  for (const fileName of fileNames) {
    try {
      const raw = await readFile(join(reportsDir, fileName), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const result = summarizeReport(parsed, fileName);
      if (result.ok) {
        accepted.push(result.report);
      } else {
        rejectedReports.push({ fileName, reason: result.reason });
      }
    } catch {
      rejectedReports.push({ fileName, reason: "Malformed JSON report ignored." });
    }
  }

  return {
    reportsDir,
    generatedAt: new Date().toISOString(),
    latestByModelBackend: latestReportsByModelBackend(accepted),
    acceptedReports: accepted.length,
    rejectedReports,
    warning: "Gauntlet PASS is not proof that a model is safe or generally capable.",
  };
}

function emptyIndex(reportsDir: string): LocalGauntletReportIndex {
  return {
    reportsDir,
    generatedAt: new Date().toISOString(),
    latestByModelBackend: [],
    acceptedReports: 0,
    rejectedReports: [],
    warning: "Gauntlet PASS is not proof that a model is safe or generally capable.",
  };
}

function summarizeReport(value: unknown, fileName: string): { ok: true; report: LocalGauntletReportSummary } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: "Report root is not an object." };
  if (value.schemaVersion !== 1) return { ok: false, reason: "Unsupported gauntlet report schemaVersion." };
  if (value.localOnly !== true) return { ok: false, reason: "Rejected report because localOnly is not true." };
  if (value.cloudUsed !== false) return { ok: false, reason: "Rejected report because cloudUsed is not false." };

  const backend = stringField(value.backend);
  const model = stringField(value.model);
  const startedAt = stringField(value.startedAt);
  const completedAt = stringField(value.completedAt);
  const overall = statusField(value.overall);
  const statusSummary = statusSummaryField(value.statusSummary);
  const results = Array.isArray(value.results) ? value.results : [];

  if (!backend) return { ok: false, reason: "Missing backend." };
  if (!model) return { ok: false, reason: "Missing model." };
  if (!startedAt || !completedAt) return { ok: false, reason: "Missing startedAt or completedAt timestamp." };
  if (!overall) return { ok: false, reason: "Missing or invalid overall status." };
  if (!statusSummary) return { ok: false, reason: "Missing or invalid statusSummary." };

  return {
    ok: true,
    report: {
      schemaVersion: 1,
      fileName,
      backend,
      model,
      modelKey: `${backend}::${model}`,
      localOnly: true,
      cloudUsed: false,
      overall,
      statusSummary,
      startedAt,
      completedAt,
      durationMs: durationBetween(startedAt, completedAt),
      taskResults: results.map(taskSummary).filter((task): task is LocalGauntletTaskSummary => task !== null),
      warning: "Narrow local smoke only, not a benchmark or proof of full safety.",
    },
  };
}

function latestReportsByModelBackend(reports: LocalGauntletReportSummary[]): LocalGauntletReportSummary[] {
  const latest = new Map<string, LocalGauntletReportSummary>();
  for (const report of reports) {
    const existing = latest.get(report.modelKey);
    if (!existing || Date.parse(report.completedAt) >= Date.parse(existing.completedAt)) {
      latest.set(report.modelKey, report);
    }
  }
  return [...latest.values()].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}

function taskSummary(value: unknown): LocalGauntletTaskSummary | null {
  if (!isRecord(value)) return null;
  const id = stringField(value.id);
  const label = stringField(value.label);
  const status = statusField(value.status);
  const reason = stringField(value.reason);
  if (!id || !label || !status || !reason) return null;
  const durationMs = typeof value.durationMs === "number" && Number.isFinite(value.durationMs)
    ? Math.max(0, Math.round(value.durationMs))
    : undefined;
  return { id, label, status, reason, durationMs };
}

function statusSummaryField(value: unknown): LocalGauntletStatusSummary | null {
  if (!isRecord(value)) return null;
  const summary: LocalGauntletStatusSummary = {
    PASS: numberField(value.PASS),
    TRY_VERIFY: numberField(value.TRY_VERIFY),
    NEEDS_CLOUD: numberField(value.NEEDS_CLOUD),
    BLOCKED: numberField(value.BLOCKED),
  };
  return summary;
}

function statusField(value: unknown): LocalGauntletStatus | null {
  return typeof value === "string" && VALID_STATUSES.has(value as LocalGauntletStatus)
    ? value as LocalGauntletStatus
    : null;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function durationBetween(startedAt: string, completedAt: string): number | undefined {
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return undefined;
  return completed - started;
}
