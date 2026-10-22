import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Integration tests: the real service code against the local Supabase stack
 * (`supabase start` + `npm run seed`), with the mock payment provider. Run
 * one file at a time; they share the database.
 */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
