import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

const stateDir = path.resolve("state/heartbeat");
await mkdir(stateDir, { recursive: true });

const now = new Date();
const payload = {
  ok: true,
  ts: now.toISOString(),
  hostname: process.env.HOSTNAME ?? null,
  note: "Heartbeat tick ran (local-only). Queue scan not implemented yet.",
};

await writeFile(
  path.join(stateDir, "last.json"),
  JSON.stringify(payload, null, 2),
  "utf8"
);

await appendFile(
  path.join(stateDir, "history.jsonl"),
  JSON.stringify(payload) + "\n",
  "utf8"
);

console.log(`[squidley-heartbeat] wrote state/heartbeat/last.json @ ${payload.ts}`);