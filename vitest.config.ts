import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests need the local Supabase stack: `npm run test:integration`.
    exclude: ["tests/integration/**", "node_modules/**"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The `server-only` guard throws outside a React Server environment;
      // unit tests exercise pure logic, so stub it out.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
