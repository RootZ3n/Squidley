import path from "node:path";
import { realpath } from "node:fs/promises";
import type { CapabilityAction, CapabilityDecision, CapabilityPolicyV1, SafetyZone } from "./types.js";
import { zonePolicy } from "./policy.js";

function firstToken(cmd: string[]): string {
  const t = (cmd?.[0] ?? "").trim();
  return t;
}

function commandString(cmd: string[]): string {
  return cmd.map((s) => String(s ?? "")).join(" ").trim();
}

function matchesDenyList(cmdStr: string, deny: string[]): string | null {
  const s = cmdStr.toLowerCase();
  for (const raw of deny) {
    const p = String(raw).toLowerCase().trim();
    if (!p) continue;
    // special case: "curl|sh" style "contains both"
    if (p.includes("|")) {
      const parts = p.split("|").map((x) => x.trim()).filter(Boolean);
      if (parts.length > 0 && parts.every((x) => s.includes(x))) return raw;
      continue;
    }
    // basic "contains"
    if (s.includes(p)) return raw;
  }
  return null;
}

function isProbablyDangerous(cmd: string[]): { dangerous: boolean; reason: string } {
  const s = commandString(cmd).toLowerCase();

  // hard reds
  const hard = ["sudo", "dd ", " mkfs", "mount ", " umount", "chmod ", "chown ", " rm -rf", " :(){", "curl|sh"];
  for (const h of hard) {
    if (h.includes("|")) {
      const parts = h.split("|").map((x) => x.trim());
      if (parts.every((p) => s.includes(p))) return { dangerous: true, reason: `matched "${h}"` };
    } else if (s.includes(h.trim())) {
      return { dangerous: true, reason: `matched "${h.trim()}"` };
    }
  }

  // suspicious patterns
  if (s.includes("> /etc/") || s.includes(" /etc/")) return { dangerous: true, reason: "touches /etc" };
  if (s.includes("~/.ssh") && (s.includes("chmod") || s.includes("chown")))
    return { dangerous: true, reason: "ssh perms change" };

  return { dangerous: false, reason: "" };
}

async function isInsideRoot(targetPath: string, projectRootResolved: string): Promise<boolean> {
  // resolve both; then realpath to avoid symlink escape
  const rootReal = await realpath(projectRootResolved).catch(() => projectRootResolved);
  const targetAbs = path.resolve(targetPath);
  const targetReal = await realpath(targetAbs).catch(() => targetAbs);

  const root = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  return targetReal === rootReal || targetReal.startsWith(root);
}

export async function checkCapabilityAction(args: {
  action: CapabilityAction;
  zone: SafetyZone;
  policy: CapabilityPolicyV1;
  projectRootResolved: string;
}): Promise<CapabilityDecision> {
  const { action, zone, policy, projectRootResolved } = args;

  const globalDenies = Array.isArray(policy.global_denies) ? policy.global_denies : [];
  const z = zonePolicy(policy, zone);

  // Expand / classify action where needed (outside-root, dangerous command)
  let cap = action.capability;

  if (action.kind === "fs.write") {
    const ok = await isInsideRoot(action.path, projectRootResolved);
    if (!ok) cap = "fs.write.outside_root";
  }

  if (action.kind === "proc.exec") {
    const danger = isProbablyDangerous(action.cmd);
    if (danger.dangerous) cap = "proc.exec.dangerous";
  }

  // Global denies always win
  if (globalDenies.includes(cap as any)) {
    return {
      allowed: false,
      zone,
      capability: cap,
      matched_rule: "global_denies",
      reason: `Denied by global policy: ${cap}`
    };
  }

  // Zone explicit deny wins
  if (z.deny.includes(cap as any)) {
    return {
      allowed: false,
      zone,
      capability: cap,
      matched_rule: "zone.deny",
      reason: `Denied in ${zone}: ${cap}`
    };
  }

  // Zone allow check (workspace is allowlisty; forge less strict)
  const allowSet = new Set(z.allow);
  if (allowSet.size > 0 && !allowSet.has(cap as any)) {
    return {
      allowed: false,
      zone,
      capability: cap,
      matched_rule: "zone.allow",
      reason: `Not allowed in ${zone}: ${cap}`
    };
  }

  // Command allow/deny extras
  if (action.kind === "proc.exec") {
    const cmd0 = firstToken(action.cmd).toLowerCase();
    const cmdStr = commandString(action.cmd);

    const hit = matchesDenyList(cmdStr, z.exec_denylist);
    if (hit) {
      return {
        allowed: false,
        zone,
        capability: cap,
        matched_rule: "exec_denylist",
        reason: `Denied command pattern "${hit}" in ${zone}`
      };
    }

    // In workspace, enforce allowlist if present
    if (zone === "workspace" && z.exec_allowlist.length > 0) {
      const allowed = z.exec_allowlist.map((x: string) => x.toLowerCase()).includes(cmd0);
      if (!allowed) {
        return {
          allowed: false,
          zone,
          capability: cap,
          matched_rule: "exec_allowlist",
          reason: `Command "${cmd0}" not allowed in workspace`
        };
      }
    }
  }

  // Outside-root write gets extra clarity
  if (action.kind === "fs.write" && cap === "fs.write.outside_root") {
    return {
      allowed: false,
      zone,
      capability: cap,
      matched_rule: "root_guard",
      reason: `Write path escapes project_root: ${action.path}`
    };
  }

  // Default allow
  return {
    allowed: true,
    zone,
    capability: cap,
    matched_rule: "allowed",
    reason: "Allowed"
  };
}
