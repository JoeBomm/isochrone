import { defineConfig } from "vitest/config";

// Pure-module tests (no Workers runtime). Run with `npm test`.
export default defineConfig({
  test: {
    include: ["src/domain/**/*.test.ts"],
    environment: "node",
  },
});
