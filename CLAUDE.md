# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A RedwoodJS 8.9 (Node 20, Yarn 4) monorepo (`api/` + `web/` workspaces) that finds fair meeting points for several participants. It generates candidate ("hypothesis") points, scores them with one OpenRouteService (ORS) Matrix API call, and picks points that minimize the maximum travel time (minimax). Isochrone polygons are generated on demand for a chosen point.

## Commands

```bash
yarn install
cp .env.example .env            # needs OPENROUTE_SERVICE_API_KEY; REDIS_URL optional (falls back to in-memory cache)
yarn rw prisma migrate dev      # SQLite via DATABASE_URL
yarn rw exec seed
yarn rw dev                     # web + api (ports come from redwood.toml: web 8915, api 8914, not the 8910 the README states)

yarn rw test --no-watch                 # all tests
yarn rw test api --no-watch             # api side only
yarn rw test api geometry --no-watch    # filter by file-name pattern
yarn rw test api -t "some test name" --no-watch   # filter by test name
yarn rw type-check
yarn rw lint
```

Tests are Jest. Many are property-based (`*.property.test.ts`, using `fast-check`).

## Architecture

**Request flow:** `web` calls GraphQL (`web/src/lib/graphql.ts`, mutations only, all `@skipAuth`) → `api/src/graphql/isochrones.sdl.ts` → resolvers in `api/src/services/isochrones.ts`.

**Algorithm pipeline** (`findOptimalLocations` → `calculateOptimalLocationsSimplified` in `api/src/services/isochrones.ts`):
1. Anchor points (centroid, median, participant locations, pairwise midpoints). These come from `generateBaselineHypothesisPoints` in the service file.
2. Bounding-box grid points (`generateBoundingBoxGridPoints`, size via `gridSize`).
3. `lib/algorithms/singleMatrix.ts` evaluates anchors and grid together in **one** Matrix API call (`apiCallCount` should be 1).
4. `lib/algorithms/scoring.ts` scores by `OptimizationGoal` (MINIMAX, MINIMIZE_VARIANCE, MINIMIZE_TOTAL). Unreachable points are filtered out rather than failing the calculation.
5. `lib/algorithms/deduplication.ts` merges points closer than `deduplicationThreshold`. The top `topM` are returned.
6. The client then calls `generateIsochrone` for the selected point. Isochrones are not computed automatically.

`calculateMinimaxCenter` and `calculateIsochrone` are older mutations that are still in the schema.

**External API layer:** `lib/openroute.ts` is the raw ORS client. `lib/cachedOpenroute.ts` wraps it with caching (`lib/cache.ts` Redis/in-memory, `lib/persistentCache.ts`, location-keyed at ~100m precision). `lib/batchedMatrix.ts` and `lib/matrix.ts` handle matrix batching and evaluation. All ORS calls should go through the cached client to protect the free-tier quota.

**Tunables** live in `api/src/lib/constants.ts` (`ALGORITHM_DEFAULTS`, `VALIDATION_LIMITS`). The SDL default arguments (`topM = 5`, `gridSize = 5`, threshold `5000`) differ from the constants (3, 7, 2500). Check which one actually applies before changing either.

**Web:** `web/src/pages/HomePage` composes the components in `web/src/components`: `Map` (Leaflet), `LocationInput`, `IsochroneControls`, `DeveloperOptions`/`DebugControls` (hypothesis-point visualization). `web/src/lib/concurrencyController.ts` throttles API requests. MUI and Tailwind 4 are both in use.

## Repo quirks

- **Docs are partly stale.** `README.md` and `DEVELOPER_GUIDE.md` describe a three-mode pipeline (Baseline / Coarse Grid / Full Refinement) and `lib/optimization.ts`. That file doesn't exist. The current implementation is the single-matrix flow above. `lib/algorithms/localRefinement.ts` and the `generateLocalRefinementHypothesisPoints` export are leftovers (recent commits removed local grid sampling). Trust the code over the docs.
- `rwsdk-project/` is a separate, in-progress RedwoodSDK/Cloudflare (D1, Workers) port with its own `package.json`. It is not part of the Yarn workspaces. `MIGRATION_GUIDE.md` and `scripts/migrate-to-d1.ts` belong to it. Ignore it unless the task is about the migration.
- The root `index.html`, `app.js`, `examples.html` and `description` are a standalone prototype and are unrelated to the Redwood app.
- `.kiro/` holds specs (`specs/*/requirements.md`, `design.md`, `tasks.md`) and steering docs from an earlier AI workflow. These are useful for the intent behind a feature (for example `specs/isochrone-center-point`).
- `api/src/lib/db.ts` and `api/src/lib/database.ts` both exist.
