import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `npm test`: tests that do not need the Workers runtime.
// - node: pure modules (domain, server logic, token contrast checks).
// - dom: React component tests (happy-dom + Testing Library).
// Workers-pool tests live in vitest.worker.config.ts.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: [
            "src/domain/**/*.test.ts",
            "src/server/**/*.test.ts",
            "src/app/**/*.test.ts",
          ],
          exclude: ["**/*.worker.test.ts", "**/node_modules/**"],
          environment: "node",
          // Vitest stubs CSS imports by default; let tokens.css through so the
          // contrast test can read it with `?raw`.
          css: { include: [/styles\/tokens\.css/] },
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          include: ["src/app/**/*.test.tsx"],
          exclude: ["**/*.worker.test.tsx", "**/node_modules/**"],
          environment: "happy-dom",
          setupFiles: ["./src/app/test/setup.ts"],
        },
      },
    ],
  },
});
