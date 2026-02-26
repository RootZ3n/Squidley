// apps/api/src/tools/workspaces.ts
import path from "node:path";

export type WorkspaceName = "squidley";

export function getWorkspaceRoot(workspace: WorkspaceName): string {
  // ✅ FIXED: No longer hardcoded to /media/zen/AI/squidley.
  // Resolves from ZENSQUID_ROOT env var so any machine works.
  // You can expand workspace names here later (hearthui, gridlands, etc.)
  const root = process.env.ZENSQUID_ROOT ?? process.cwd();

  const map: Record<WorkspaceName, string> = {
    squidley: root,
  };

  return path.resolve(map[workspace]);
}
