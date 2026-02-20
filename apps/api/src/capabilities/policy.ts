import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CapabilityPolicyV1, SafetyZone } from "./types.js";

export type LoadedPolicy = {
  policy: CapabilityPolicyV1;
  policyPath: string;
  projectRootResolved: string;
};

function isObject(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null;
}

export async function loadCapabilityPolicy(zensquidRoot: string): Promise<LoadedPolicy> {
  const policyPath = path.resolve(zensquidRoot, "config/capabilities.policy.json");

  // Conservative default if file is missing
  const fallback: CapabilityPolicyV1 = {
    version: 1,
    project_root: zensquidRoot,
    global_denies: ["systemctl.system", "proc.exec.dangerous"],
    zones: {
      workspace: {
        allow: ["fs.read", "proc.exec"],
        deny: ["fs.write", "fs.write.outside_root", "systemctl.user", "pkg.install"],
        exec_allowlist: ["ls", "cat", "rg", "git", "node", "pnpm", "python", "jq"],
        exec_denylist: ["sudo", "rm", "dd", "mkfs", "chmod", "chown", "mount", "umount", "curl|sh"]
      },
      forge: {
        allow: ["fs.read", "fs.write", "proc.exec", "systemctl.user", "net.egress"],
        deny: ["fs.write.outside_root", "systemctl.system", "pkg.install"],
        exec_denylist: ["sudo", "dd", "mkfs", "mount", "umount", "curl|sh"]
      }
    }
  };

  try {
    const raw = await readFile(policyPath, "utf-8");
    const parsed = JSON.parse(raw);

    if (!isObject(parsed) || parsed.version !== 1 || !isObject(parsed.zones)) {
      return {
        policy: fallback,
        policyPath,
        projectRootResolved: path.resolve(fallback.project_root)
      };
    }

    const policy = parsed as CapabilityPolicyV1;
    const projectRootResolved = path.resolve(policy.project_root || zensquidRoot);

    return { policy, policyPath, projectRootResolved };
  } catch {
    return {
      policy: fallback,
      policyPath,
      projectRootResolved: path.resolve(fallback.project_root)
    };
  }
}

export function normalizeZone(z: unknown): SafetyZone {
  return z === "workspace" || z === "diagnostics" || z === "forge" || z === "godmode"
    ? z
    : "workspace";
}

export function zonePolicy(policy: CapabilityPolicyV1, zone: SafetyZone) {
  // If zone missing in policy, fallback to workspace, then empty
  const z = policy.zones?.[zone] ?? policy.zones?.["workspace"] ?? {};
  return {
    allow: Array.isArray(z.allow) ? z.allow : [],
    deny: Array.isArray(z.deny) ? z.deny : [],
    exec_allowlist: Array.isArray(z.exec_allowlist) ? z.exec_allowlist : [],
    exec_denylist: Array.isArray(z.exec_denylist) ? z.exec_denylist : []
  };
}
