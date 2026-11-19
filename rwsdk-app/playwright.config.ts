import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { E2E } from "./e2e/env";

/**
 * End-to-end tests: `npm run test:e2e` (= `playwright test`).
 *
 * - App: `vite dev` on E2E_PORT (default 5199), started here and never reused,
 *   so it always runs with the env below.
 * - ORS: a local stub (e2e/ors-stub.ts) on E2E_ORS_STUB_PORT (default 5288),
 *   started by e2e/global-setup.ts. Real ORS and real keys are never used.
 * - Browser: Chromium. Set PLAYWRIGHT_CHROMIUM_PATH to use an installed
 *   Chromium/Chrome binary (e.g. /snap/bin/chromium); unset, Playwright's own
 *   Chromium is used (`npx playwright install chromium` once).
 * - Map tiles and every other non-local request are answered or blocked in
 *   the browser (see the spec), so the suite runs offline.
 *
 * How the stub URL and the fake key reach the dev Worker: through the process
 * environment. With CLOUDFLARE_INCLUDE_PROCESS_ENV=true and no .dev.vars file,
 * the Cloudflare Vite plugin (via wrangler's getVarsForDev) adds process.env
 * to the Worker's env in local dev; process.env takes precedence over .env
 * files. No .dev.vars is written, so `npm run test:worker` is unaffected.
 */

const root = fileURLToPath(new URL(".", import.meta.url));

// A .dev.vars file makes the plugin ignore process.env entirely: the Worker
// would get whatever key/base URL that file holds (possibly a real key and the
// real ORS endpoint). Refuse to run rather than risk that.
if (existsSync(`${root}.dev.vars`)) {
  throw new Error(
    "e2e: rwsdk-app/.dev.vars exists. The e2e dev server passes a fake ORS key and the stub URL through " +
      "the process environment, which wrangler ignores while .dev.vars exists. Move it aside and re-run.",
  );
}

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Every test drives the real dev server (and Vite compiles on first use).
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: E2E.baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
        launchOptions,
      },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        launchOptions,
      },
    },
  ],
  webServer: {
    command: `npx vite dev --port ${E2E.appPort} --strictPort`,
    url: E2E.baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      ORS_API_KEY: E2E.apiKey,
      ORS_BASE_URL: E2E.stubURL,
      E2E_EPHEMERAL_STATE: "1",
    },
  },
});
