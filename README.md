# Where To Meet?

Find a fair place to meet. Add two or more starting points, pick how people are travelling, and Where To Meet?
suggests meeting points that keep everyone's journey as even as it can (by default, it minimizes the
longest trip). Pick one and it draws the area reachable from it within a chosen number of minutes.

Live at **https://wheretomeet.us** (staging: https://staging.wheretomeet.us).

Built with [RedwoodSDK](https://docs.rwsdk.com/) on Cloudflare Workers, using the
[openrouteservice](https://openrouteservice.org/) APIs (hosted by HeiGIT) for geocoding, travel-time
matrices and isochrones. It replaces an earlier RedwoodJS (GraphQL, Prisma, Redis) implementation, which
remains in git history and on the `snapshot/pre-rwsdk-rewrite` branch.

## How it works

1. **Candidates.** From the participants' locations it generates anchor points (centroid, median,
   participant locations, pairwise midpoints) plus a grid over their bounding box.
2. **One matrix call.** All candidates are scored with a single ORS Matrix request (participants x
   candidates), cached in KV.
3. **Score and rank.** Candidates are scored by goal (`MINIMAX`, `MINIMIZE_TOTAL` or `MINIMIZE_VARIANCE`).
   Unreachable candidates are dropped, near-duplicates within 2.5 km are merged, and the top few are returned.
4. **Isochrone on demand.** Selecting a result requests one isochrone for it (also cached).

The domain logic is in `src/domain` (pure functions); everything that touches ORS, KV or request limits is in
`src/server`.

## Getting started

Requires Node 22 or newer (Cloudflare's tooling needs it).

```shell
npm install
cp .dev.vars.example .dev.vars   # then put your ORS key in ORS_API_KEY
npm run dev                      # http://localhost:5173
```

Get a free key at [account.heigit.org](https://account.heigit.org/). `.dev.vars` is git-ignored.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit and property tests (Vitest) |
| `npm run test:worker` | Builds, then runs the tests that need the Workers runtime. Uses a dummy ORS key; never calls ORS |
| `npm run test:e2e` | Playwright against a stubbed ORS (see below) |
| `npm run check` | Regenerates Worker types and type-checks |
| `npm run build` | Production build |

### End-to-end tests

```shell
npx playwright install chromium     # once
npm run test:e2e
PLAYWRIGHT_CHROMIUM_PATH=/snap/bin/chromium npm run test:e2e   # use an installed Chromium
```

- Runs every spec in `e2e/` at a desktop (1280x800) and a mobile (375x667, touch) viewport.
- Starts its own `vite dev` on port 5199 (`E2E_PORT`) and a local ORS stub on 127.0.0.1:5288
  (`E2E_ORS_STUB_PORT`, see `e2e/ors-stub.ts`). Real ORS, real keys and map tile servers are never contacted.
- **The run refuses to start while `.dev.vars` exists**, because wrangler then ignores the fake key and stub
  URL the tests pass through the environment. Move it aside first: `mv .dev.vars .dev.vars.bak`, then move it back.

## Environments and deploying

There are two deployed environments, each its own Worker with its own KV namespace, rate limiters and
`ORS_API_KEY` secret (they currently share one ORS key and its quota). The top level of `wrangler.jsonc` is
local development only; never deploy it.

| Environment | Worker | URL |
|---|---|---|
| staging | `meeting-point-finder-staging` | https://staging.wheretomeet.us |
| production | `meeting-point-finder-production` | https://wheretomeet.us |

### Automatic (GitHub Actions)

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- **Pull request:** type check, unit, worker and e2e tests, then an uploaded (not deployed) **staging preview
  version**. Its URL (`https://pr-<number>-meeting-point-finder-staging.<subdomain>.workers.dev`) is posted as a
  comment on the PR. It uses the staging KV cache and the shared ORS quota. `staging.wheretomeet.us` is unchanged.
  PRs from forks get no secrets and no preview.
- **Push to `main`:** the same checks, then deploy staging, then deploy production (the `production` GitHub
  Environment; add required reviewers there for a manual approval gate).
- **Needs** the repository secrets `CLOUDFLARE_API_TOKEN` (an account token from the "Edit Cloudflare Workers"
  template, scoped to this account and the `wheretomeet.us` zone; set an expiry and rotate it) and
  `CLOUDFLARE_ACCOUNT_ID`. `ORS_API_KEY` is a Worker secret per environment, not a GitHub secret.

### Manual

The Cloudflare Vite plugin selects the environment at build time from `CLOUDFLARE_ENV` (not `--env`):

```shell
CLOUDFLARE_ENV=staging npm run build && CLOUDFLARE_ENV=staging npx wrangler deploy
```

Do not use `npm run release`: its first step (`rw-scripts ensure-deploy-env`) is a first-time-setup helper
that prompts for confirmation and creates a stray `TMP_WORKER_CREATED` secret.

Set or rotate a secret with `npx wrangler secret put ORS_API_KEY --env <staging|production>`. Values cannot be
read back from Cloudflare.

## Limits

Per-client rate limits (Workers Rate Limiting, keyed by `CF-Connecting-IP`) are sized against the ORS free
plan: 5 searches, 6 isochrones and 30 geocodes per minute. They apply before the cache, so cached repeats
count. They cap a client per minute; they are not a daily budget, so many clients can still exhaust the shared
ORS daily quota (users then see a quota message). See `src/server/rateLimit.ts` and the comments in
`wrangler.jsonc`.

## Project docs

- `docs/superpowers/specs/2026-11-19-rwsdk-rewrite-design.md`: design for the rewrite
- `docs/superpowers/plans/2026-11-19-rwsdk-rewrite.md`: the implementation plan (paths in it predate the move to the repo root)
- `docs/superpowers/specs/ux-direction.md`: the approved UX direction
- `.kiro/`: specs and steering notes from the original RedwoodJS app, kept for the intent behind the algorithm
