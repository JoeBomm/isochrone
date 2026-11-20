# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Halfway": finds fair meeting points for several participants. A RedwoodSDK (rwsdk) app on Cloudflare Workers (React Server Components, KV cache, Workers Rate Limiting), using the openrouteservice (ORS) APIs on `api.heigit.org`. It generates candidate points, scores them with **one** ORS Matrix call, ranks them by goal (`MINIMAX` default, `MINIMIZE_TOTAL`, `MINIMIZE_VARIANCE`), and draws an isochrone on demand for the chosen point. Live at https://wheretomeet.us (staging: https://staging.wheretomeet.us). `README.md` has the user-facing overview.

The repo previously held a RedwoodJS (GraphQL/Prisma/Redis) app. It was removed; it lives in git history and on the `snapshot/pre-rwsdk-rewrite` branch.

## Commands

Node **22+** is required (`engines`). The default `node` on some machines is older; use `nvm use 22`.

```bash
npm install
cp .dev.vars.example .dev.vars   # put a real ORS_API_KEY in it
npm run dev                      # vite dev, http://localhost:5173
npm test                         # unit + property tests (Vitest, src/domain and src/server)
npm run test:worker              # builds first, then runs *.worker.test.ts in workerd
npm run test:e2e                 # Playwright, ORS stubbed (see quirks)
npm run check                    # regenerate Worker types + tsc
npx vitest run src/server/rateLimit.test.ts   # one file
```

CI (`.github/workflows/ci.yml`): PRs run all checks and upload a non-deployed staging preview version (`wrangler versions upload --preview-alias <branch>` (branch name reduced to a hostname-safe alias, hashed if it had to change)) whose URL is commented on the PR; pushes to `main` run the checks, then deploy staging, then production (`production` GitHub Environment). Needs repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Manual deploy (never `npm run release`, see quirks). The environment is chosen at **build time** by `CLOUDFLARE_ENV`:

```bash
CLOUDFLARE_ENV=staging npm run build && CLOUDFLARE_ENV=staging npx wrangler deploy
CLOUDFLARE_ENV=production npm run build && CLOUDFLARE_ENV=production npx wrangler deploy
```

## Architecture

**Request flow:** client components (`src/app/components`) call three `"use server"` functions in `src/server/actions.ts` (`geocodeAction`, `findMeetingPointsAction`, `getIsochroneAction`). They are thin wrappers over `src/server/actionHandlers.ts`, which does, in order: rate limit (`rateLimit.ts`), validate (`validate.ts`), construct the ORS client, then cache (`cache.ts`, KV read-through) or ORS. Nothing touches KV or ORS before the rate check, so cached repeats still count against the limits.

- `src/domain`: pure logic with no I/O (`geometry`, `candidates`, `scoring`, `dedupe`, `types`, `constants`). Tunables are in `constants.ts` (`TOP_M` 3, `GRID_SIZE` 7, `DEDUP_THRESHOLD_METERS` 2500, participant and minute limits, cache TTLs).
- `src/server/findMeetingPoints.ts`: orchestration. One cached matrix call for anchors plus bounding-box grid; unreachable candidates are dropped; all-unreachable throws `NoReachablePointError`.
- `src/server/ors/client.ts`: raw ORS client with typed `OrsError` kinds. Matrix and isochrones use `/openrouteservice/v2/...`, geocoding uses `/pelias/v1/search`, all on `https://api.heigit.org` (overridable with `ORS_BASE_URL`). The key goes only in the `Authorization` header, never in a URL.
- `src/server/cache.ts`: `cacheKey` rounds coordinates to 3 decimals (~100 m) and hashes; `cached()` treats KV failures as misses and never caches errors. TTLs: geocode 7 days, matrix and isochrone 24 hours.
- `src/app`: UI. `components/ui` are design primitives, `components/shell` the app shell, `pages/home.tsx` the route, `pages/styleguide.tsx` a review page. Design direction is in `docs/superpowers/specs/ux-direction.md`. Map is Leaflet.
- Errors reach the client as an `ActionResult` envelope (`{ ok: false, error: { code, message } }`), not thrown. Codes include `validation`, `not_found`, `no_reachable_point`, `quota`, `rate_limited`, `upstream`.

## Environments

`wrangler.jsonc`: the **top level is local dev only** (placeholder KV id, rate-limit namespaces 4601-4603); never deploy it. `env.staging` and `env.production` each redeclare their own KV `CACHE`, three rate limiters (namespace ids 4611-4613 and 4621-4623, account-wide unique) and custom domain, because bindings are not inherited. Worker names are `meeting-point-finder-staging` and `-production`. They currently share one ORS key and its free-tier quota. `ORS_API_KEY` is a per-environment Worker secret (`npx wrangler secret put ORS_API_KEY --env <name>`); the value cannot be read back, and the user types secrets themselves.

## Quirks that cost time

- **Do not run `npm run release`.** Its first step (`rw-scripts ensure-deploy-env`) prompts "proceed with deployment? (y/N)" (hangs if stdin stays open, silently skips on EOF) and creates a stray `TMP_WORKER_CREATED` secret. Use the build + `wrangler deploy` commands above.
- **Declaring `routes` switches `workers_dev` and preview URLs OFF at deploy unless set explicitly.** Staging pins `"workers_dev": true, "preview_urls": true` because PR previews are uploaded versions served on workers.dev; production pins both `false`. Without the pin, the next staging deploy silently kills PR previews (`wrangler versions upload` then prints no preview URL). If it happens: `POST /accounts/<id>/workers/scripts/<worker>/subdomain {"enabled":true,"previews_enabled":true}`.
- **E2E refuses to run while `.dev.vars` exists** (wrangler would ignore the fake key and stub URL). Move it aside for the run and restore it after. Needs `npx playwright install chromium` once.
- **`test:worker` is hermetic on purpose.** `vitest.worker.config.ts` pins a dummy `ORS_API_KEY` and an unroutable `ORS_BASE_URL`, because the workers pool otherwise loads `.dev.vars` and makes live ORS calls with the real key. "Connection refused" noise in its output is expected.
- **Rate limits are triplicated:** `RATE_LIMITS` in `rateLimit.ts` and the `ratelimits` bindings in every environment of `wrangler.jsonc`. `rateLimit.test.ts` parses `wrangler.jsonc` with a regex, so keep each binding on **one line**.
- **Server functions must keep the exact form** `export const NAME = serverQuery(fn, { method: "POST" });` (see the comment in `actions.ts`). POST keeps coordinates and addresses out of URLs; data-only queries avoid re-rendering the page.
- **Never put `ORS_API_KEY` in `vars`, the client bundle or a URL.** `e2e` and `test:worker` check the bundle for it.
- Secrets live in git-ignored `.dev.vars` (template `.dev.vars.example` is tracked). `.env*` is ignored too, but the app does not use a `.env`: wrangler only reads one when `.dev.vars` is missing, so keep it that way. The old Redwood `.env` and its `.env.example` were removed.
- `docs/superpowers/plans/2026-11-19-rwsdk-rewrite.md` uses the old `rwsdk-app/` paths (the app was later moved to the repo root). `.kiro/` holds specs from the old app, useful for the intent behind the algorithm, not the current code.
- ORS free-tier limits (matrix 500/day, 40/min; isochrones 500/day, 20/min; geocode 1000/day, 100/min) are on the account dashboard; `api.openrouteservice.org` is deprecated and gets a fraction of the quota.
