import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Workers-pool tests. rwsdk requires tests to run against the BUILT worker
// (RSC transforms), so `npm run test:worker` runs `npm run build` first.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./dist/worker/wrangler.json" },
      // Hermetic: the pool would otherwise load .dev.vars and spend the real
      // ORS_API_KEY on live requests. A dummy key plus an unroutable base URL
      // means these tests can never reach ORS (calls fail as "upstream").
      miniflare: {
        bindings: { ORS_API_KEY: "test-key-not-real", ORS_BASE_URL: "http://127.0.0.1:1" },
      },
    }),
  ],
  test: {
    include: ["src/**/*.worker.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
