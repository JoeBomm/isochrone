# RedwoodSDK Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the meeting-point finder as a deployed rwsdk + Cloudflare Workers app with a new, polished UX, keeping the existing algorithm's behavior.

**Architecture:** Pure domain modules (ported from `api/src/lib`) behind a fetch-based ORS client and a KV read-through cache, exposed as rwsdk server functions. A mobile-first UI uses server components for layout and client components for the form and Leaflet map.

**Tech Stack:** rwsdk (`create-rwsdk`), React 18/19 per starter, Cloudflare Workers + KV, Vitest, Playwright, Leaflet, OpenRouteService.

**Spec:** `docs/superpowers/specs/2026-11-19-rwsdk-rewrite-design.md`

## Global Constraints

- New app lives in `rwsdk-app/` at repo root, outside the Yarn workspaces, with its own `package.json` and lockfile. The old Redwood `api/` and `web/` stay untouched until Task 12.
- Delete the stale `rwsdk-project/` in Task 0. Don't port its migration/feature-flag scaffolding.
- Coordinates are `{ lat, lng }` everywhere. Convert to ORS `[lng, lat]` only inside `src/server/ors/`.
- `ORS_API_KEY` is a Worker secret. It must never appear in client bundles or in `vars`.
- Exactly **one** ORS matrix call per `findMeetingPoints` request.
- Port algorithm behavior, not code shape. Reference sources: `api/src/lib/algorithms/{anchors,coarseGrid,scoring,deduplication}.ts`, `api/src/lib/geometry.ts`, `api/src/lib/openroute.ts`, `api/src/lib/constants.ts`. Read only the file named in the task you're on.
- Before using any rwsdk or Cloudflare API, check current docs (context7 `/redwoodjs/sdk`, Cloudflare docs MCP). Don't rely on memory.
- Constants (`TOP_M`, `GRID_SIZE`, `DEDUP_THRESHOLD_METERS`, validation limits) are copied from `api/src/lib/constants.ts`. The SDL defaults and the constants disagree (5/5/5000 vs 3/7/2500), so pick the **constants** values and note this in `src/domain/constants.ts`.

## Review Focus

1. Participants at identical or near-identical coordinates give a zero-area bounding box. Expect a result (the participant location) and no NaN or empty grid.
2. Every grid or anchor candidate unreachable for some participant (null durations, e.g. across water). Expect a clear "no reachable meeting point" error, not a crash or a bogus point.
3. ORS returns 429 or 401 or is down. Expect distinct, human-readable errors and no cached failure.
4. Geocode returns zero or ambiguous results, or the query is empty or enormous. Expect a "not found" state and a rejected input.
5. A public deploy with a shared ORS key: many rapid requests. Expect per-client rate limiting before any ORS call.

---

### Task 0: Scaffold, tooling, baseline

**Files:**
- Create: `rwsdk-app/` (via starter), `rwsdk-app/wrangler.jsonc` (KV binding `CACHE`), `rwsdk-app/vitest.config.ts`, `rwsdk-app/vitest.worker.config.ts`
- Delete: `rwsdk-project/`

**Interfaces:**
- Produces: `npm test` (pure-module Vitest, no Workers pool), `npm run test:worker` (Workers pool against the built worker, per rwsdk's Vitest guide), `npm run dev`, `npm run build`.

- [ ] **Step 1:** Look up the current `create-rwsdk` usage and starter layout via context7. Run it into `rwsdk-app/`, then `npm install`.
- [ ] **Step 2:** Run `npm run dev`, load `/`, and confirm the starter page renders. Run `npm run build` and confirm it succeeds.
- [ ] **Step 3:** Add `src/domain/smoke.test.ts` asserting `1 + 1 === 2`, plus a plain Vitest config that includes `src/domain/**/*.test.ts`. Run `npm test` and expect PASS.
- [ ] **Step 4:** `git rm -r rwsdk-project`. Add a `rwsdk-app/` section to the root `.gitignore` if the starter's own ignore doesn't cover `node_modules`, `.wrangler` and `dist`.
- [ ] **Step 5:** Commit `chore: scaffold rwsdk app, remove stale rwsdk-project`.

### Task 1: Domain types and geometry

**Files:**
- Create: `rwsdk-app/src/domain/{types.ts,constants.ts,geometry.ts}`
- Test: `rwsdk-app/src/domain/geometry.test.ts`

**Interfaces:**
- Produces (`types.ts`): `Coordinate {lat:number; lng:number}`, `TravelMode = 'driving-car'|'cycling-regular'|'foot-walking'`, `OptimizationGoal = 'MINIMAX'|'MINIMIZE_TOTAL'|'MINIMIZE_VARIANCE'`, `Candidate {id:string; coordinate:Coordinate; kind:'ANCHOR'|'GRID'}`.
- Produces (`geometry.ts`): `haversineMeters(a,b):number`, `centroid(ps:Coordinate[]):Coordinate`, `medianPoint(ps):Coordinate`, `pairwiseMidpoints(ps):Coordinate[]`, `boundingBox(ps, paddingRatio=0.1):{south,west,north,east}`, `gridInBox(box, size:number):Coordinate[]` (size×size, inclusive of edges).

- [ ] **Step 1:** Write failing tests. `haversineMeters({lat:0,lng:0},{lat:0,lng:1})` is within 1% of 111195. `centroid` of a unit square is its center. `pairwiseMidpoints` of 3 points has length 3. `gridInBox(box,5)` has length 25. Coincident points: `boundingBox([p,p])` has `north>south` and `east>west` (minimum span), and `gridInBox` of it returns 25 finite coordinates (Review Focus 1).
- [ ] **Step 2:** Run `npm test` and expect FAIL.
- [ ] **Step 3:** Implement per the signatures. Use plain math, no turf unless a test needs it. Copy constants from `api/src/lib/constants.ts` into `constants.ts`.
- [ ] **Step 4:** Run `npm test` and expect PASS.
- [ ] **Step 5:** Commit `feat(domain): types and geometry`.

### Task 2: Candidate generation, scoring, dedupe

**Files:**
- Create: `rwsdk-app/src/domain/{candidates.ts,scoring.ts,dedupe.ts}`
- Test: matching `*.test.ts`, including `scoring.property.test.ts` (fast-check)

**Interfaces:**
- Consumes: Task 1 types and geometry.
- Produces: `generateCandidates(participants:Coordinate[], gridSize:number):Candidate[]` (anchors then grid; ids stable and unique). `scoreCandidates(times:(number|null)[][], candidates:Candidate[], goal:OptimizationGoal):ScoredCandidate[]`, where `times[participantIdx][candidateIdx]` is in seconds and `ScoredCandidate = Candidate & {perPersonSeconds:number[]; max:number; mean:number; total:number; variance:number; score:number}`. The result is sorted ascending by `score` with ties broken by `max`, then `total`. Candidates with any `null` are dropped. `dedupe(sorted:ScoredCandidate[], thresholdMeters:number):ScoredCandidate[]` keeps the better-ranked point of any pair closer than the threshold.

- [ ] **Step 1:** Write failing tests, using fixtures derived from the existing `scoring.test.ts` and `deduplication.test.ts`. MINIMAX picks the lowest max, and MINIMIZE_TOTAL the lowest sum. A candidate with one `null` is absent. If all candidates are null the result is `[]`. Property: output is sorted, and `dedupe` output has no pair closer than the threshold.
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement. Reference `scoring.ts` and `deduplication.ts` for tie-break behavior only.
- [ ] **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit `feat(domain): candidates, scoring, dedupe`.

### Task 3: ORS client

**Files:**
- Create: `rwsdk-app/src/server/ors/{client.ts,errors.ts}`
- Test: `client.test.ts` (injected fake `fetch`)

**Interfaces:**
- Produces: `class OrsError extends Error {kind:'rate_limited'|'unauthorized'|'bad_request'|'not_found'|'upstream'; retryAfterSeconds?:number}`. `createOrsClient(opts:{apiKey:string; fetch?:typeof fetch}):OrsClient` with `matrix(origins:Coordinate[], destinations:Coordinate[], mode:TravelMode):Promise<(number|null)[][]>` (`[origin][destination]`, seconds), `isochrone(center:Coordinate, minutes:number, mode:TravelMode):Promise<GeoJSON.Polygon|GeoJSON.MultiPolygon>`, `geocode(query:string):Promise<{coordinate:Coordinate; label:string}[]>`.

- [ ] **Step 1:** Write failing tests with a fake fetch. `matrix` posts `[lng,lat]` ordering with the expected `sources`/`destinations` indexes, and `null` durations map to `null`. HTTP 429 gives `kind:'rate_limited'` with `retryAfterSeconds` from the header. 401/403 gives `unauthorized`. 5xx gives `upstream`. Empty geocode `features` returns `[]` (Review Focus 3 and 4). For **all three** calls (matrix, isochrone, geocode), the key is sent only in the `Authorization` header, and no requested URL contains `api_key` or the key value. The old clients in `api/` and `rwsdk-project/` pass `api_key` in the geocode query string, which leaks the key into logs and caches. Don't copy that. Confirm in the current ORS docs that the geocode endpoint accepts the header.
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement against the endpoints used in `api/src/lib/openroute.ts` (`/v2/matrix/{profile}`, `/v2/isochrones/{profile}`, `/geocode/search`). Check the current ORS docs for request and response shapes and the per-request matrix size limits, and don't copy limits from memory.
- [ ] **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit `feat(server): ORS client with typed errors`.

### Task 4: KV read-through cache

**Files:**
- Create: `rwsdk-app/src/server/cache.ts`
- Test: `cache.test.ts` (Workers pool with a miniflare KV, or an in-memory fake `KVNamespace`)

**Interfaces:**
- Produces: `cacheKey(namespace:string, parts:(string|number|Coordinate|Coordinate[])[]):Promise<string>`. It builds a canonical string with coordinates rounded to ~100m (3 decimals) and returns `${namespace}:${sha256hex}` of the **full** canonical string (`crypto.subtle`). Never truncate the digest or an encoding of the input; the old `rwsdk-project` cache keyed on `btoa(...).slice(0,8)`, so almost all matrix requests collided. `cached<T>(kv:KVNamespace, key:string, ttlSeconds:number, load:()=>Promise<T>, isValid?:(v:unknown)=>v is T):Promise<T>`. A hit that fails `isValid` is treated as a miss. It never caches a thrown error, and a KV read/write failure falls through to `load`.

- [ ] **Step 1:** Write failing tests. A second call within TTL doesn't invoke `load`. Two coordinates 30m apart share a key. Two participant lists that share the same first several coordinates but differ later get different keys (regression for the truncation bug). A cached matrix whose dimensions don't match the request (`isValid` false) is reloaded. A throwing `load` isn't cached. A throwing `kv.get` still returns `load()`'s value.
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement. Use KV `expirationTtl`. Keep TTLs in `constants.ts` (geocode long, matrix and isochrone shorter, taken from the old `cache.ts`).
- [ ] **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit `feat(server): KV read-through cache`.

### Task 5: `findMeetingPoints` orchestration

**Files:**
- Create: `rwsdk-app/src/server/findMeetingPoints.ts`
- Test: `findMeetingPoints.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: `findMeetingPoints(input:{participants:Coordinate[]; mode:TravelMode; goal:OptimizationGoal; topM?:number; gridSize?:number; dedupeMeters?:number}, deps:{ors:OrsClient; kv:KVNamespace}):Promise<{points:ScoredCandidate[]; candidatesEvaluated:number; matrixCalls:1; debugCandidates:Candidate[]}>`. Throws `NoReachablePointError` when scoring leaves nothing.

- [ ] **Step 1:** Write failing tests with a fake `OrsClient`. The fake matrix is called exactly once. Results are length ≤ `topM`. A fake matrix returning all `null` throws `NoReachablePointError` (Review Focus 2). Identical participants return that location (Review Focus 1). Fewer than 2 participants throws a validation error.
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement: generate candidates, one cached matrix call (`cacheKey('matrix', [participants, candidates coords, mode])`, with `isValid` checking the result is `participants.length × candidates.length`), score, dedupe, slice.
- [ ] **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Commit `feat(server): findMeetingPoints orchestration`.

### Task 6: Server functions, validation, rate limiting

**Files:**
- Create: `rwsdk-app/src/server/{actions.ts,validate.ts,rateLimit.ts}`
- Modify: `rwsdk-app/src/worker.tsx`, `wrangler.jsonc`
- Test: `validate.test.ts`, `rateLimit.test.ts`, `actions.worker.test.ts` (Workers pool)

**Interfaces:**
- Produces (`"use server"` in `actions.ts`): `findMeetingPointsAction(input:unknown)`, `getIsochroneAction(input:unknown)`, `geocodeAction(query:string)`. Each returns `{ok:true; data}` or `{ok:false; error:{code:'validation'|'rate_limited'|'no_reachable_point'|'quota'|'upstream'|'not_found'; message:string; retryAfterSeconds?:number}}`. Errors are returned, not thrown, so the UI can render them.
- `validate.ts`: `parseFindInput(x:unknown)` and `parseIsochroneInput(x:unknown)` (coordinate ranges, 2 to a max number of participants taken from the old `VALIDATION_LIMITS`, query length cap, minutes range). `rateLimit.ts`: `checkRateLimit(kvOrBinding, clientId:string):Promise<{allowed:boolean; retryAfterSeconds?:number}>`. Check Cloudflare's current rate-limiting binding docs first, and fall back to a KV counter if the binding doesn't fit.

- [ ] **Step 1:** Write failing tests. Out-of-range lat/lng, 1 participant, a 500-char geocode query and `minutes:0` are all rejected. The (N+1)th request in the window is denied with `retryAfterSeconds`, and the rate check happens before any ORS call (Review Focus 3, 4, 5).
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement. Read `ORS_API_KEY` from the Worker env via `requestInfo`/`env`, with no `VITE_`/client exposure. Derive the client id from the `CF-Connecting-IP` header. Map `OrsError.kind` to the error codes above.
- [ ] **Step 4:** Run `npm test` and `npm run test:worker` and expect PASS. Then `grep -r "ORS_API_KEY" dist/client` and expect no matches.
- [ ] **Step 5:** Commit `feat(server): validated, rate-limited server functions`.

### Task 7: Design foundation and app shell

**Files:**
- Create: `rwsdk-app/src/app/{Document.tsx,styles/tokens.css,styles/base.css}`, `rwsdk-app/src/app/components/ui/*` (Button, Field, Select, Card, Alert, Spinner)
- Modify: `rwsdk-app/src/worker.tsx`

**Interfaces:**
- Produces: CSS custom-property design tokens (color, type scale, spacing, radius, light/dark), the shared UI primitives, and a responsive shell with a persistent map region and a controls panel. Side panel on desktop, bottom sheet on mobile.

- [ ] **Step 1:** Invoke `superpowers:brainstorming` and `frontend-design:frontend-design` for the visual direction: a short set of choices (palette, type, layout of panel and map, empty state). Write the chosen direction into `docs/superpowers/specs/ux-direction.md`, and get the user's approval before building.
- [ ] **Step 2:** Implement tokens and primitives. Each primitive renders in a small `/_styleguide` route used for review.
- [ ] **Step 3:** Verify with `npm run dev` and Playwright screenshots at 375px and 1280px wide. Check keyboard focus rings, AA contrast, and `prefers-color-scheme`.
- [ ] **Step 4:** Commit `feat(ui): design tokens, primitives, shell`.

### Task 8: Participant and options form

**Files:**
- Create: `rwsdk-app/src/app/components/{ParticipantList.tsx,AddressField.tsx,TripOptions.tsx}` (client components)
- Test: `ParticipantList.test.tsx` (Vitest + Testing Library)

**Interfaces:**
- Consumes: `geocodeAction`, UI primitives.
- Produces: `<MeetingForm onSubmit={(input:FindInput)=>void} pending:boolean/>`, with add and remove participants (min 2, max per validation), debounced address search showing suggestions via `geocodeAction`, travel-mode segmented control, goal select, and a "minutes for isochrone" control. Participants are shown as a labelled, removable list.

- [ ] **Step 1:** Write failing tests. Submit is disabled with fewer than 2 resolved participants. Selecting a suggestion resolves a participant. Removing one below 2 disables submit. A "not found" geocode shows an inline message. Everything is operable by keyboard.
- [ ] **Step 2:** Run and expect FAIL, then implement, then run and expect PASS.
- [ ] **Step 3:** Commit `feat(ui): participant and options form`.

### Task 9: Map and results

**Files:**
- Create: `rwsdk-app/src/app/components/{MeetingMap.tsx,ResultsList.tsx,ResultsPanel.tsx}`, `rwsdk-app/src/app/pages/HomePage.tsx`
- Test: `ResultsList.test.tsx`

**Interfaces:**
- Consumes: `findMeetingPointsAction`, `getIsochroneAction`, form from Task 8.
- Produces: `MeetingMap` (client-only Leaflet, loaded so it doesn't run during SSR; participant markers, ranked result markers, isochrone polygon, fit-to-bounds). `ResultsList` shows rank, max/mean time, and per-person times, and works without the map (accessible text alternative). Selecting a result calls `getIsochroneAction` with the point's coordinate, and shows the polygon with a loading state. States: initial (empty), loading, success, `no_reachable_point`, `rate_limited` (with retry timer), `quota`, and generic error. The dev-only hypothesis-point layer is shown only when `?debug=1`.

- [ ] **Step 1:** Write failing tests for `ResultsList` (ranking order, selection callback, each error code renders its own message) and run them.
- [ ] **Step 2:** Implement, and verify manually in `npm run dev` against the real ORS key (this is the first end-to-end run). Record a note on any ORS limit hit.
- [ ] **Step 3:** Commit `feat(ui): map, results, isochrone`.

### Task 10: End-to-end tests

**Files:**
- Create: `rwsdk-app/e2e/meeting-flow.spec.ts`, `rwsdk-app/playwright.config.ts`

- [ ] **Step 1:** Write a Playwright test running against the dev server with ORS stubbed (route interception of the server-function responses, or a `ORS_BASE_URL` override pointing at a local stub): add two participants, submit, expect ranked results and a drawn isochrone on selection; plus a `rate_limited` error scenario.
- [ ] **Step 2:** Run `npx playwright test` and expect PASS at desktop and mobile viewports.
- [ ] **Step 3:** Commit `test(e2e): core meeting flow`.

### Task 11: Deploy

**Files:**
- Modify: `rwsdk-app/wrangler.jsonc` (staging and production envs, KV ids), add `rwsdk-app/README.md`

- [ ] **Step 1:** Using the cloudflare skills/MCP, create KV namespaces for staging and prod, and set `ORS_API_KEY` as a secret in each (`wrangler secret put`). The user types the secret, and it must not be passed through tool arguments or logged.
- [ ] **Step 2:** Deploy staging. Run the Task 10 flow against the staging URL by hand. Confirm `wrangler tail` shows no key leakage and that a repeat request hits the cache.
- [ ] **Step 3:** Deploy production, optionally attaching a custom domain (ask the user). Enable Workers observability.
- [ ] **Step 4:** Commit `chore: deploy config`.

### Task 12: Cleanup and docs

**Files:**
- Delete: `api/`, `web/`, `scripts/` (Redwood and D1 migration scripts), `redwood.toml`, `graphql.config.js`, root Yarn/Redwood config, `.redwood/`, `MIGRATION_GUIDE.md`, the stale `DEVELOPER_GUIDE.md` and `TESTING.md`, and the root prototype files `index.html`, `app.js`, `examples.html`, `description`
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1:** Confirm production works, then delete the files above in one commit. They remain in git history and on `snapshot/pre-rwsdk-rewrite`.
- [ ] **Step 2:** Rewrite `README.md` for the new app, and update `CLAUDE.md` (commands, architecture, and remove the "repo quirks" that no longer apply). Possibly move `rwsdk-app/` contents to the repo root (ask the user).
- [ ] **Step 3:** Commit `chore: remove RedwoodJS app, update docs`.
