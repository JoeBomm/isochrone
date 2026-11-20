/**
 * Shared e2e settings. The API key is a fake test string: real ORS keys are
 * never used by this suite (the stub rejects any other Authorization value).
 */
const port = (name: string, fallback: number) => {
  const raw = process.env[name];
  const n = raw ? Number(raw) : fallback;
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new Error(`${name} must be a TCP port, got ${raw}`);
  return n;
};

const appPort = port("E2E_PORT", 5199);
const stubPort = port("E2E_ORS_STUB_PORT", 5288);

export const E2E = {
  apiKey: "e2e-fake-key",
  appPort,
  stubPort,
  baseURL: `http://localhost:${appPort}`,
  stubURL: `http://127.0.0.1:${stubPort}`,
} as const;
