import { defineConfig } from "vitest/config";

// Pure-module tests (no Workers runtime). Run with `npm test`.
export default defineConfig({
  test: {
    include: ["src/domain/**/*.test.ts", "src/server/**/*.test.ts"],
    exclude: ["**/*.worker.test.ts", "**/node_modules/**"],
    environment: "node",
  },
});
