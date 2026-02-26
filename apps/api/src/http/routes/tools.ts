// apps/api/src/http/routes/tools.ts
//
// HTTP route registrar for tool endpoints.
// Now delegates directly to the consolidated routes/tools.ts plugin.
// The old double-hop proxy pattern is gone.

import type { FastifyInstance } from "fastify";
import { toolsRoutes } from "../../routes/tools.js";

export async function registerToolsRoutes(app: FastifyInstance) {
  // Register all tool routes directly — no more /runner prefix hop.
  // Routes registered: /tools/list, /tools/run, /tools/fs/read,
  //   /tools/fs/write, /tools/exec, /tools/systemctl/user
  await app.register(toolsRoutes);
}
