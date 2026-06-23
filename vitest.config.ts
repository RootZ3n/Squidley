import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [
      "src/core/**",
      "node_modules/**",
      // node:test suites (run via `npm run test:core`), not vitest.
      "src/profile.test.ts",
      "src/tools/bridge-tools.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
