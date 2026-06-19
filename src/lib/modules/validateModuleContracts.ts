import type { PublicPehModuleDefinition } from "./contracts";

const VALID_CATEGORIES = new Set(["core-local", "cloud-unlock", "future"]);
const VALID_STATUSES = new Set(["active", "limited", "prepared", "locked", "future"]);

export interface ModuleContractValidationOptions {
  routeExists?: (route: string) => boolean;
}

export function validateModuleContracts(
  modules: readonly PublicPehModuleDefinition[],
  options: ModuleContractValidationOptions = {},
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const routes = new Set<string>();

  for (const entry of modules) {
    if (ids.has(entry.id)) issues.push(`${entry.id}: duplicate module id`);
    ids.add(entry.id);

    if (!VALID_CATEGORIES.has(entry.category)) issues.push(`${entry.id}: unknown category ${entry.category}`);
    if (!VALID_STATUSES.has(entry.status)) issues.push(`${entry.id}: unknown status ${entry.status}`);

    if (entry.status === "active" && !entry.route) issues.push(`${entry.id}: active module is missing route`);
    if (entry.route) {
      if (routes.has(entry.route) && !entry.routeAliasOf) issues.push(`${entry.id}: duplicate route ${entry.route}`);
      routes.add(entry.route);
      if (options.routeExists && !options.routeExists(entry.route)) {
        issues.push(`${entry.id}: route ${entry.route} does not exist`);
      }
    }

    if (entry.category === "cloud-unlock" && entry.status === "active" && entry.route) {
      issues.push(`${entry.id}: cloud-unlock module exposes an active route`);
    }
    if (entry.category === "cloud-unlock" && !entry.cloudUnlockRequired) {
      issues.push(`${entry.id}: cloud-unlock module must require cloud unlock`);
    }

    if (!entry.docs.primary && !entry.docs.note) issues.push(`${entry.id}: missing docs declaration`);
    if (entry.assessmentActions !== "none" && entry.assessmentActions.length === 0) issues.push(`${entry.id}: empty Assessment action declaration`);
    if (entry.receiptActions !== "none" && entry.receiptActions.length === 0) issues.push(`${entry.id}: empty receipt action declaration`);

    if (usesStorage(entry) && (!entry.storageKeys || entry.storageKeys.length === 0)) {
      issues.push(`${entry.id}: storage-using module is missing storage keys`);
    }
    if (usesHandoffs(entry) && (!entry.handoffKinds || entry.handoffKinds.length === 0)) {
      issues.push(`${entry.id}: handoff-using module is missing handoff kinds`);
    }
  }

  return issues;
}

function usesStorage(module: PublicPehModuleDefinition): boolean {
  return ["colloquium", "archivum", "activity-log", "nous", "settings"].includes(module.id);
}

function usesHandoffs(module: PublicPehModuleDefinition): boolean {
  return ["chat", "velum", "notebook", "more-input", "vision"].includes(module.id);
}
