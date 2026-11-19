import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Workers-pool tests. rwsdk requires tests to run against the BUILT worker
// (RSC transforms), so `npm run test:worker` runs `npm run build` first.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./dist/worker/wrangler.json" },
    }),
  ],
  test: {
    include: ["src/**/*.worker.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
