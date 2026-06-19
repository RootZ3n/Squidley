import type { AssessmentActionId } from "@/lib/assessment";

export type ModuleCategory = "core-local" | "cloud-unlock" | "future";
export type ModuleStatus = "active" | "limited" | "prepared" | "locked" | "future";

export interface ModuleDocsDeclaration {
  primary?: string;
  note?: string;
}

export interface ModuleProviderRequirement {
  providerId: string;
  purpose: string;
  active: boolean;
}

export interface PublicPehModuleDefinition {
  id: string;
  displayName: string;
  latinMeaning?: string;
  beginnerDescription: string;
  category: ModuleCategory;
  status: ModuleStatus;
  publicEnabled: boolean;
  enabled: boolean;
  localOnlySupported: boolean;
  cloudUnlockRequired: boolean;
  tourAvailable: boolean;
  tourId?: string;
  route?: string;
  routeAliasOf?: string;
  assessmentActions: readonly AssessmentActionId[] | "none";
  receiptActions: readonly string[] | "none";
  storageKeys?: readonly string[];
  handoffKinds?: readonly string[];
  providerRequirements?: readonly ModuleProviderRequirement[];
  docs: ModuleDocsDeclaration;
  limitations?: readonly string[];
}
