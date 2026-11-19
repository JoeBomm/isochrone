"use server";

import { env } from "cloudflare:workers";
import { getRequestInfo } from "rwsdk/worker";
import {
  handleFindMeetingPoints,
  handleGeocode,
  handleIsochrone,
  type ServerEnv,
} from "./actionHandlers";

/**
 * rwsdk server functions. Thin wrappers only: all logic (validation, rate
 * limiting, ORS, caching, error mapping) lives in actionHandlers.ts.
 *
 * Docs checked 2026-11-19 (context7 /redwoodjs/sdk):
 * - "use server" modules may be imported from client components; calls run on
 *   the Worker inside the request lifecycle.
 * - Env vars / secrets / bindings: `import { env } from "cloudflare:workers"`.
 * - Request: `getRequestInfo()` (recommended for actions; throws outside a
 *   request) exposes `request`, `response`, `ctx`.
 *
 * ORS_API_KEY is read here, server-side, from the Worker secret. It is never
 * passed to or returned to the client.
 */

// ORS_API_KEY / ORS_BASE_URL are not in the generated Env type (secrets are
// not declared in wrangler.jsonc), hence the cast to our own interface.
const serverEnv = () => env as unknown as ServerEnv;
const deps = () => ({ env: serverEnv(), headers: getRequestInfo().request.headers });

export async function findMeetingPointsAction(input: unknown) {
  return handleFindMeetingPoints(input, deps());
}

export async function getIsochroneAction(input: unknown) {
  return handleIsochrone(input, deps());
}

export async function geocodeAction(query: string) {
  return handleGeocode(query, deps());
}
