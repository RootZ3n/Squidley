// apps/api/src/chat/proactivePush.ts
//
// Reads proactive-watcher output and sends Telegram pings when warranted.
// Called by scheduler after proactive-watcher runs.

import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

function proactiveDir(): string {
  return path.resolve(process.env.ZENSQUID_ROOT ?? process.cwd(), "memory", "proactive");
}

type PendingPing = {
  message: string;
  priority: "HIGH" | "MEDIUM";
  file: string;
};

export async function readPendingPings(): Promise<PendingPing[]> {
  try {
    const dir = proactiveDir();
    const files = await readdir(dir);
    const pings: PendingPing[] = [];

    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const filepath = path.join(dir, file);
      try {
        const content = await readFile(filepath, "utf8");
        if (content.includes("NO_PING")) {
          await unlink(filepath).catch(() => {});
          continue;
        }
        const pingMatch = content.match(/PING:\s*(.+)/);
        const priorityMatch = content.match(/PRIORITY:\s*(HIGH|MEDIUM)/);
        if (pingMatch) {
          pings.push({
            message: pingMatch[1].trim(),
            priority: (priorityMatch?.[1] as "HIGH" | "MEDIUM") ?? "MEDIUM",
            file: filepath,
          });
        }
      } catch {}
    }
    return pings;
  } catch {
    return [];
  }
}

export async function clearPing(filepath: string): Promise<void> {
  await unlink(filepath).catch(() => {});
}
