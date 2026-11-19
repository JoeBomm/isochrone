"use server";

import { env } from "cloudflare:workers";
import { getRequestInfo, serverQuery } from "rwsdk/worker";
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
 *
 * Data-only queries (docs and rwsdk@1.7.5 source checked 2026-11-19):
 * a plain exported function is called from the client as an "action": the
 * Worker re-renders the whole page RSC tree and the client re-applies it on
 * every call. All three functions only read data, so they are wrapped in
 * `serverQuery`, which makes the client send `x-rsc-data-only: true` and the
 * Worker return only the result (no page render, no client re-render).
 *
 * `{ method: "POST" }` is deliberate. serverQuery defaults to GET, which puts
 * the arguments (participant coordinates, address text) JSON-encoded in the
 * URL query string, where they end up in logs, history and caches. With POST
 * the arguments stay in the request body, and rwsdk also enforces a
 * same-origin check for non-GET server functions.
 *
 * Keep each export in exactly the form
 *   export const NAME = serverQuery(fn, { method: "POST" });
 * rwsdk's Vite transform detects serverQuery syntactically to emit the
 * client stub with source "query" (actions.queries.test.ts guards this).
 */

// ORS_API_KEY / ORS_BASE_URL are not in the generated Env type (secrets are
// not declared in wrangler.jsonc), hence the cast to our own interface.
const serverEnv = () => env as unknown as ServerEnv;
const deps = () => ({ env: serverEnv(), headers: getRequestInfo().request.headers });

// Keep `{ method: "POST" }` with double quotes: rwsdk's transform reads the
// method with a "..."-only pattern and silently falls back to GET otherwise
// (the client would then send GET and the Worker would reject it with 405).
export const findMeetingPointsAction = serverQuery(
  async (input: unknown) => handleFindMeetingPoints(input, deps()),
  { method: "POST" }
);

export const getIsochroneAction = serverQuery(
  async (input: unknown) => handleIsochrone(input, deps()),
  { method: "POST" }
);

export const geocodeAction = serverQuery(
  async (query: string) => handleGeocode(query, deps()),
  { method: "POST" }
);
