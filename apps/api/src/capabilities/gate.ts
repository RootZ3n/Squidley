import path from "node:path";
import { realpath } from "node:fs/promises";
import type {
  CapabilityAction,
  CapabilityDecision,
  CapabilityPolicyV1,
  SafetyZone,
} from "./types.js";
import { zonePolicy } from "./policy.js";

const NETWORK_BINARIES = new Set([
  "curl",
  "wget",
  "ping",
  "nc",
  "ncat",
  "netcat",
  "ssh",
  "scp",
  "rsync",
  "telnet",
  "ftp",
  "sftp",
  "dig",
  "nslookup",
  "traceroute",
]);

function firstToken(cmd: string[]): string {
  return (cmd?.[0] ?? "").trim();
}

function commandString(cmd: string[]): string {
  return cmd.map((s) => String(s ?? "")).join(" ").trim();
}

function isNetworkCommand(cmd: string[]): boolean {
  const bin = firstToken(cmd).toLowerCase();
  return NETWORK_BINARIES.has(bin);
}

async function isInsideRoot(
  targetPath: string,
  projectRootResolved: string
): Promise<boolean> {
  const rootReal =
    (await realpath(projectRootResolved).catch(() => projectRootResolved)) +
    path.sep;
  const targetAbs = path.resolve(targetPath);
  const targetReal = await realpath(targetAbs).catch(() => targetAbs);
  return targetReal.startsWith(rootReal);
}

export async function checkCapabilityAction(args: {
  action: CapabilityAction;
  zone: SafetyZone;
  policy: CapabilityPolicyV1;
  projectRootResolved: string;
}): Promise<CapabilityDecision> {
  const { action, zone, policy, projectRootResolved } = args;

  const globalDenies = policy.global_denies ?? [];
  const z = zonePolicy(policy, zone);

  let cap = action.capability;

  if (action.kind === "fs.write") {
    const ok = await isInsideRoot(action.path, projectRootResolved);
    if (!ok) cap = "fs.write.outside_root";
  }

  if (action.kind === "proc.exec") {
    if (isNetworkCommand(action.cmd)) {
      cap = "net.egress";
    }
  }

  if (globalDenies.includes(cap as any)) {
    return {
      allowed: false,
      zone,
      capability: cap,
      matched_rule: "global_denies",
      reason: `Denied by global policy: ${cap}`,
    };
  }

  if (z.deny.includes(cap as any)) {
    return {
      allowed: false,
      zone,
      capability: cap,
      matched_rule: "zone.deny",
      reason: `Denied in ${zone}: ${cap}`,
    };
  }

  const allowSet = new Set(z.allow);
  if (allowSet.size > 0 && !allowSet.has(cap as any)) {
    return {
      allowed: false,
      zone,
      capability: cap,
      matched_rule: "zone.allow",
      reason: `Not allowed in ${zone}: ${cap}`,
    };
  }

  return {
    allowed: true,
    zone,
    capability: cap,
    matched_rule: "allowed",
    reason: "Allowed",
  };
}