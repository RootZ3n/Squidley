// apps/api/src/capabilities/types.ts

export type SafetyZone = "workspace" | "diagnostics" | "forge" | "godmode";

export type Capability =
  | "fs.read"
  | "fs.write"
  | "fs.write.outside_root"
  | "proc.exec"
  | "proc.exec.dangerous"
  | "systemctl.user"
  | "systemctl.system"
  | "pkg.install"
  | "net.egress";

export type CapabilityAction =
  | {
      kind: "fs.read";
      capability: Capability; // broad on purpose (cap may be rewritten)
      path: string;
    }
  | {
      kind: "fs.write";
      capability: Capability; // broad on purpose (cap may be rewritten)
      path: string;
      bytes?: number;
    }
  | {
      kind: "proc.exec";
      capability: Capability; // broad on purpose (cap may be rewritten to net.egress)
      cmd: string[];
      cwd?: string;
    }
  | {
      kind: "systemctl.user";
      capability: Capability; // broad for consistency
      cmd: string[];
    };

export type CapabilityDecision = {
  allowed: boolean;
  zone: SafetyZone;
  capability: Capability;
  reason: string;
  matched_rule?: string | null;
};

export type CapabilityPolicyV1 = {
  version: 1;

  // Your loader uses fallback.project_root unconditionally.
  project_root: string;

  global_denies?: Capability[];

  // Fallback/config can omit zones; zonePolicy() already handles fallback-to-workspace.
  zones: Partial<
    Record<
      SafetyZone,
      {
        allow?: Capability[];
        deny?: Capability[];
        exec_allowlist?: string[];
        exec_denylist?: string[];
      }
    >
  >;
};