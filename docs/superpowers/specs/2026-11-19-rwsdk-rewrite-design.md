# Meeting-Point Finder on RedwoodSDK: Design Spec

## Goal
Redeploy the existing Redwood-based "isochrone center point" app on RedwoodSDK (rwsdk) + Cloudflare Workers, with a new UX/UI designed from scratch. Functional parity is required. The existing visual design is not.

## Functionality to preserve (from the current app)
1. User enters 2+ participant locations (address text, geocoded) and picks a travel mode: driving, cycling or walking.
2. User picks an optimization goal: MINIMAX (default), MINIMIZE_TOTAL or MINIMIZE_VARIANCE.
3. The server generates candidate points: anchors (centroid, median, each participant, pairwise midpoints) plus an N×N bounding-box grid. It evaluates them in **one** ORS Matrix call, scores them, drops unreachable candidates, deduplicates by distance and returns the top M.
4. The user selects a result and the app draws its isochrone for a chosen number of minutes.
5. Results are shown on a map with per-participant travel times.
6. ORS responses are cached (geocode, matrix, isochrone) to protect the free-tier quota.
7. Optional dev view of hypothesis points. Keep it behind a flag, not in the main UX.

## Out of scope
Accounts and auth, saved locations (the Prisma `Location` model is unused), GraphQL, Redis, the `calculateMinimaxCenter` and `calculateIsochrone` legacy mutations, `localRefinement`, and the three-mode "Baseline/Coarse/Full" concept (already removed in code).

## Architecture
- rwsdk app (created with `create-rwsdk`) on Cloudflare Workers. Server functions (`"use server"`) are the API. There is no GraphQL.
- `src/domain/`: pure TypeScript (geometry, anchors, grid, scoring, dedupe). No I/O, plain Vitest.
- `src/server/ors/`: `fetch`-based ORS client (matrix, isochrone, geocode) with typed errors.
- `src/server/cache.ts`: KV-backed read-through cache with TTLs.
- `src/server/actions.ts`: `findMeetingPoints`, `getIsochrone`, `geocode`, with input validation and rate limiting.
- UI: server components for layout, client components for the form and Leaflet map (browser-only).
- `ORS_API_KEY` is a Worker secret and is never sent to the browser. The current `redwood.toml` exposes it to the web side, and that must not carry over.

## UX principles (detailed design happens in the UI tasks)
Mobile-first and responsive. One primary flow: add people → see best meeting points → pick one → see the isochrone. Accessible: keyboard operable, labelled controls, WCAG AA contrast, a text alternative for map results (a ranked list). Clear loading, empty and error states. Quota and rate-limit errors get human wording.

## Deployment
Cloudflare Workers via wrangler. KV namespace plus a rate-limit mechanism. Separate staging and production environments. The ORS key is set with `wrangler secret`.
