export type SafetyZone = "workspace" | "diagnostics" | "forge" | "godmode";

export type Capability =
  | "fs.read"
  | "fs.write"
  | "fs.write.outside_root"
  | "proc.exec"
  | "proc.exec.dangerous"
  | "systemctl.user"
  | "systemctl.system"
  | "net.egress"
  | "pkg.install";

export type CapabilityAction =
  | {
      kind: "fs.read";
      capability: "fs.read";
      path: string;
    }
  | {
      kind: "fs.write";
      capability: "fs.write" | "fs.write.outside_root";
      path: string;
      bytes: number;
    }
  | {
      kind: "proc.exec";
      capability: "proc.exec" | "proc.exec.dangerous";
      cmd: string[];
      cwd?: string | null;
    }
  | {
      kind: "systemctl.user";
      capability: "systemctl.user";
      cmd: string[]; // full argv, e.g. ["systemctl","--user","restart","zensquid"]
    };

export type CapabilityDecision = {
  allowed: boolean;
  reason: string;
  zone: SafetyZone;
  capability: CapabilityAction["capability"];
  matched_rule: string;
};

export type CapabilityPolicyV1 = {
  version: 1;
  project_root: string;
  global_denies?: Capability[];
  zones: Record<
    string,
    {
      allow?: Capability[];
      deny?: Capability[];
      exec_allowlist?: string[];
      exec_denylist?: string[];
    }
  >;
};
