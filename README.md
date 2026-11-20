# RedwoodSDK Minimal Starter

This is the starter project for RedwoodSDK. It's a template designed to get you up and running as quickly as possible.

Create your new project:

```shell
npx create-rwsdk my-project-name
cd my-project-name
npm install
```

## Running the dev server

```shell
npm run dev
```

Point your browser to the URL displayed in the terminal (e.g. `http://localhost:5173/`). You should see the RedwoodSDK welcome page in your browser.

## Further Reading

- [RedwoodSDK Documentation](https://docs.rwsdk.com/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers)

## End-to-end tests

```shell
npm run test:e2e                                          # = npx playwright test
PLAYWRIGHT_CHROMIUM_PATH=/snap/bin/chromium npm run test:e2e   # use an installed Chromium
```

- Runs every spec in `e2e/` at a desktop (1280x800) and a mobile (375x667, touch) viewport.
- Starts its own `vite dev` on port 5199 (`E2E_PORT`) and a local OpenRouteService stub on
  127.0.0.1:5288 (`E2E_ORS_STUB_PORT`, see `e2e/ors-stub.ts`). Real ORS, real keys and the
  OpenStreetMap tile servers are never contacted.
- The fake key and the stub URL reach the dev Worker through the process environment
  (`CLOUDFLARE_INCLUDE_PROCESS_ENV=true`), so no `.dev.vars` is written. The run refuses to
  start if `.dev.vars` exists, because wrangler then ignores the process environment.
- Without `PLAYWRIGHT_CHROMIUM_PATH`, Playwright's own Chromium is used
  (`npx playwright install chromium` once).
