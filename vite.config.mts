import { defineConfig } from "vite";
import { redwood } from "rwsdk/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "worker" },
      // Set only by the e2e dev server (playwright.config.ts): keep local KV
      // and rate-limit state in memory, so e2e runs start clean and never
      // read or write the normal dev state in .wrangler/state.
      ...(process.env.E2E_EPHEMERAL_STATE === "1" ? { persistState: false } : {}),
    }),
    redwood(),
  ],
});
