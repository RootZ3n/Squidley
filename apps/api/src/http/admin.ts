// apps/api/src/http/admin.ts
//
// Re-exports requireAdmin and adminTokenOk from the shared auth module.
// This file is kept for backwards compatibility with any imports that
// reference admin.ts directly.

export { requireAdmin, adminTokenOk } from "./auth.js";
