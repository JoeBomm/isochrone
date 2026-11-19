import { E2E } from "./env";
import { startOrsStub } from "./ors-stub";

/**
 * Starts the ORS stub in the Playwright runner process. The returned function
 * is Playwright's teardown for it: it runs after all tests, also when tests
 * fail, so the port is always released.
 */
export default async function globalSetup() {
  const stub = await startOrsStub({ apiKey: E2E.apiKey, port: E2E.stubPort });
  return async () => {
    if (stub.stats.violations.length > 0) {
      console.error(`[ors-stub] ${stub.stats.violations.length} rejected request(s):\n  ${stub.stats.violations.join("\n  ")}`);
    }
    await stub.close();
  };
}
