// apps/api/src/tools/workspaces.ts
import path from "node:path";

export type WorkspaceName = "squidley";

export function getWorkspaceRoot(workspace: WorkspaceName): string {
  // You can expand this later (hearthui, gridlands, etc.)
  // For now, keep it explicit and local-first.
  const map: Record<WorkspaceName, string> = {
    squidley: "/media/zen/AI/squidley",
  };

  return path.resolve(map[workspace]);
}