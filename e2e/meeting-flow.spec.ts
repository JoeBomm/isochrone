import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { E2E } from "./env";
import type { StubStats } from "./ors-stub";
import { RATE_LIMITS } from "../src/server/rateLimit";

/**
 * Core meeting flow against the real dev server (vite dev + local Worker),
 * with ORS replaced by the local stub (e2e/ors-stub.ts). Every test runs in
 * both projects (desktop 1280x800, mobile 375x667 with touch) unless it says
 * otherwise.
 *
 * Scenarios are picked through the places a test chooses (see PLACES in the
 * stub): normal places give durations, "Quota ..." places make ORS answer
 * 429, "island" places make every matrix duration null.
 *
 * Rate limiting is the app's real limiter (the Workers Rate Limiting binding,
 * simulated locally by Miniflare; FIND limit RATE_LIMITS.find per 60s per
 * client, the same value wrangler.jsonc configures). Each test
 * gets its own client id through the CF-Connecting-IP header the app keys on
 * (src/server/rateLimit.ts), like distinct visitors behind Cloudflare's edge,
 * so tests don't share limiter buckets. The rate-limit tests exhaust their own
 * bucket by submitting repeatedly; nothing is lowered or mocked. The
 * client-side countdown is advanced with Playwright's clock.
 */

// 1x1 white PNG for every OpenStreetMap tile request: the suite never
// contacts tile.openstreetmap.org (OSM's policy forbids automated clients).
const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  "base64",
);
const TILE_HOST = "tile.openstreetmap.org";
// Anything that is not the local dev server.
const EXTERNAL = /^(?!https?:\/\/(localhost|127\.0\.0\.1)[:/])[a-z]+:\/\//;

const COPY = {
  quota: "The route service has reached its daily limit. Try again later.",
  noReachable: "No place is reachable for everyone by this travel mode. Try another mode or move a start point.",
  canRetry: "You can search again now.",
};

const NORWICH = { typed: "Carrow", label: "Carrow Road, Norwich, England" };
const CAMBRIDGE = { typed: "Mill Lane", label: "Mill Lane, Cambridge, England" };
const QUOTA_A = { typed: "Quota", label: "Quota Quay, Limitford" };
const QUOTA_B = { typed: "Quota", label: "Quota Row, Limitford" };
const ISLAND_A = { typed: "Lighthouse", label: "Lighthouse Rock, Isle of Nowhere" };
const ISLAND_B = { typed: "Harbour Steps", label: "Harbour Steps, Isle of Elsewhere" };
type Place = typeof NORWICH;

/** Stable per test and project, unique in practice: 10.x.y.z from a hash. */
function clientIp(info: TestInfo): string {
  const h = createHash("sha256").update(`${info.project.name}|${info.titlePath.join("|")}`).digest();
  return `10.${h[0]}.${h[1]}.${h[2]}`;
}

async function stubStats(): Promise<StubStats> {
  const res = await fetch(`${E2E.stubURL}/__stats`);
  return (await res.json()) as StubStats;
}

const browserErrors = new WeakMap<Page, string[]>();
const externalRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": clientIp(info) });
  const external: string[] = [];
  externalRequests.set(page, external);
  await page.route(EXTERNAL, (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "https:" && url.hostname === TILE_HOST) {
      return route.fulfill({ status: 200, contentType: "image/png", body: TILE_PNG });
    }
    external.push(url.href);
    return route.abort("blockedbyclient");
  });
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(externalRequests.get(page), "requests that left the machine").toEqual([]);
  expect(browserErrors.get(page), "errors in the browser").toEqual([]);
  expect((await stubStats()).violations, "requests the ORS stub rejected").toEqual([]);
});

// ---------------------------------------------------------------------------

async function openApp(page: Page) {
  await page.goto("/");
  // Leaflet is loaded lazily on the client; data-ready marks the map as live.
  await expect(page.locator(".meeting-map[data-ready]")).toBeAttached();
}

const form = (page: Page) => page.locator("form.meeting-form");
const submitButton = (page: Page) => form(page).locator('button[type="submit"]');
const resultsPanel = (page: Page) => page.locator(".results-panel");
const announcer = (page: Page) => page.locator("[data-announcer]");

/**
 * Type into Person N's address combobox, wait for the suggestion, and choose
 * it with the keyboard (ArrowDown to it, Enter), as a keyboard user would.
 */
async function choosePlace(page: Page, person: number, place: Place) {
  if (person > 2) await form(page).getByRole("button", { name: "Add person" }).click();
  const input = page.getByRole("combobox", { name: `Starting address for Person ${person}` });
  await input.click();
  await input.pressSequentially(place.typed, { delay: 20 });
  const options = page.getByRole("listbox", { name: "Address suggestions" }).getByRole("option");
  const option = options.filter({ hasText: place.label });
  await expect(option).toBeVisible();
  const labels = await options.allTextContents();
  const index = labels.findIndex((l) => l.trim() === place.label);
  expect(index, `suggestions: ${labels.join(" | ")}`).toBeGreaterThanOrEqual(0);
  for (let i = 0; i <= index; i += 1) await input.press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute("aria-activedescendant", (await option.getAttribute("id"))!);
  await input.press("Enter");
  await expect(input).toHaveValue(place.label);
  await expect(input).toHaveAttribute("aria-expanded", "false");
}

async function addPeople(page: Page, ...places: Place[]) {
  for (const [i, place] of places.entries()) await choosePlace(page, i + 1, place);
  await expect(submitButton(page)).toBeEnabled();
}

/** True when the given response is a POST to the app (a server function call). */
const isServerCall = (r: { url(): string; request(): { method(): string } }) =>
  r.request().method() === "POST" && r.url().startsWith(E2E.baseURL);

/** Click submit and wait until the search's server call has been answered and rendered. */
async function submitAndSettle(page: Page, press: () => Promise<void>) {
  const answered = page.waitForResponse(isServerCall);
  await press();
  await answered;
  await expect(resultsPanel(page)).toHaveAttribute("aria-busy", "false");
}

/**
 * Submit until the app's real rate limiter refuses (FIND limit:
 * RATE_LIMITS.find per 60s per client). Returns how many searches were made,
 * the refused one included. A fixed window can reset once mid-loop, hence the
 * upper bound of two windows' worth plus one.
 */
async function searchUntilRateLimited(page: Page, press: () => Promise<void>): Promise<number> {
  const countdown = page.locator(".countdown");
  for (let n = 1; n <= 2 * RATE_LIMITS.find + 1; n += 1) {
    await submitAndSettle(page, press);
    if (await countdown.isVisible()) return n;
    await expect(page.getByRole("list", { name: "Meeting points" })).toBeVisible();
  }
  throw new Error("the rate limiter never refused a search");
}

/** "Meeting point 1, Longest trip 38 min, Average 36 min" -> 38 */
const longestMinutes = (name: string) => Number(/Longest trip (\d+(?:\.\d+)?) min/.exec(name)?.[1]);

async function expectRankedResults(page: Page): Promise<Locator> {
  const list = page.getByRole("list", { name: "Meeting points" });
  const buttons = list.getByRole("button", { name: /^Meeting point \d+,/ });
  await expect(buttons.first()).toBeAttached();
  const names = await buttons.evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  expect(names.length).toBeGreaterThanOrEqual(1);
  expect(names.length).toBeLessThanOrEqual(3); // TOP_M
  names.forEach((name, i) => expect(name).toMatch(new RegExp(`^Meeting point ${i + 1}, Longest trip \\d+ min, Average \\d+ min$`)));
  // Default goal is "Fairest for everyone" (minimax): longest trip never decreases down the list.
  const longest = names.map(longestMinutes);
  expect(longest).toEqual([...longest].sort((a, b) => a - b));
  // Each result has a fairness strip: one row per person, with minutes as text.
  const items = list.locator(":scope > li");
  await expect(items).toHaveCount(names.length);
  for (let i = 0; i < names.length; i += 1) {
    const strip = items.nth(i).getByRole("list", { name: "Travel time for each person" });
    await expect(strip.getByRole("listitem")).toHaveCount(2);
    await expect(strip.getByRole("listitem").nth(0)).toContainText(/Person 1\s*\d+ min/);
    await expect(strip.getByRole("listitem").nth(1)).toContainText(/Person 2\s*\d+ min/);
    // The longest trip is marked in text, not only by colour.
    await expect(strip.getByText("(longest)")).not.toHaveCount(0);
  }
  return buttons;
}

// ---------------------------------------------------------------------------

test("happy path: two people, ranked results, isochrone for the chosen point", async ({ page }) => {
  await openApp(page);
  await addPeople(page, NORWICH, CAMBRIDGE);

  await submitAndSettle(page, () => submitButton(page).click());
  await expect(announcer(page)).toHaveText(/^[1-3] meeting points? found\.$/);
  await expect(page.getByRole("heading", { name: "Meeting points" })).toBeFocused();
  const buttons = await expectRankedResults(page);
  // Start and result markers are on the map.
  await expect(page.locator(".leaflet-marker-pane .map-person")).toHaveCount(2);
  await expect(page.locator(".leaflet-marker-pane .map-result")).toHaveCount(await buttons.count());

  await buttons.first().click();
  // CSS locator: on mobile the list is hidden at peek after selecting.
  await expect(page.locator(".result__select").first()).toHaveAttribute("aria-pressed", "true");
  const polygon = page.locator(".leaflet-overlay-pane path.map-isochrone");
  await expect(polygon).toHaveCount(1);
  await expect(polygon).toBeVisible();
  await expect(polygon).toHaveAttribute("d", /^M[\d.\s-]+L/);
  await expect(announcer(page)).toHaveText("The map shows everywhere within 10 minutes of the meeting point.");

  const stats = await stubStats();
  expect(stats.isochrone).toBeGreaterThan(0);
  expect(stats.matrix).toBeGreaterThan(0);
});

test("rate_limited: the real limiter refuses, the countdown runs, submit re-enables", async ({ page }) => {
  await page.clock.install();
  await openApp(page);
  await addPeople(page, NORWICH, CAMBRIDGE);

  const searches = await searchUntilRateLimited(page, () => submitButton(page).click());
  expect(searches, "searches allowed before the limiter refused").toBeGreaterThan(RATE_LIMITS.find);

  // Freeze the page clock, then tick the countdown one second at a time. (The
  // countdown is a chain of 1s timeouts, each scheduled after React renders
  // the previous tick, so one big runFor would only fire the first.)
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  let serverCalls = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().startsWith(E2E.baseURL)) serverCalls += 1;
  });

  const alert = resultsPanel(page).getByRole("alert");
  await expect(alert).toContainText(/You're searching too fast\. Try again in \d+ seconds?\./);
  // The announced sentence is fixed (said once); only the aria-hidden copy ticks.
  await expect(alert.locator(".visually-hidden")).toHaveText("You're searching too fast. Try again in 60 seconds.");
  const countdown = page.locator(".countdown .num");
  const start = Number(await countdown.textContent());
  expect(start).toBeGreaterThan(50);
  expect(start).toBeLessThanOrEqual(60);
  await expect(submitButton(page)).toHaveAttribute("aria-disabled", "true");

  // A blocked submit starts no search. (force: Playwright treats aria-disabled
  // as not actionable, but the button stays clickable for real users.)
  await submitButton(page).click({ force: true });

  for (let left = start - 1; left >= 1; left -= 1) {
    await page.clock.runFor(1_000);
    await expect(countdown).toHaveText(String(left));
    await expect(submitButton(page)).toHaveAttribute("aria-disabled", "true");
  }
  await page.clock.runFor(1_000);
  await expect(resultsPanel(page).getByRole("status")).toHaveText(COPY.canRetry);
  await expect(page.locator(".countdown")).toHaveCount(0);
  await expect(submitButton(page)).not.toHaveAttribute("aria-disabled", "true");
  await expect(submitButton(page)).toBeEnabled();
  expect(serverCalls, "searches started while blocked").toBe(0);
});

test("quota: an ORS 429 shows the daily-limit message", async ({ page }) => {
  await openApp(page);
  await addPeople(page, QUOTA_A, QUOTA_B);
  await submitAndSettle(page, () => submitButton(page).click());
  const alert = resultsPanel(page).getByRole("alert");
  await expect(alert).toHaveText(COPY.quota);
  await expect(alert.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Meeting points" })).toHaveCount(0);
  await expect(submitButton(page)).toBeEnabled();
});

test("no_reachable_point: an all-null matrix shows the unreachable message", async ({ page }) => {
  await openApp(page);
  await addPeople(page, ISLAND_A, ISLAND_B);
  await submitAndSettle(page, () => submitButton(page).click());
  await expect(resultsPanel(page).getByRole("alert")).toHaveText(COPY.noReachable);
  await expect(page.getByRole("list", { name: "Meeting points" })).toHaveCount(0);
});

test("mobile focus: select moves focus to the peek summary, announcements stay audible, rate limit keeps focus", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "mobile layout (bottom sheet) only");
  await openApp(page);
  await addPeople(page, NORWICH, CAMBRIDGE);
  await submitAndSettle(page, () => submitButton(page).click());
  const buttons = await expectRankedResults(page);

  // Select from the list by touch: the sheet snaps to peek, which hides the row.
  await buttons.first().tap();
  const sheet = page.locator(".sheet");
  await expect(sheet).toHaveAttribute("data-snap", "peek");
  const peekText = page.locator(".peek__text");
  await expect(peekText).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.classList.contains("peek__text"))).toBe(true);
  await expect(peekText).toHaveText(/^Meeting point 1 of [1-3]\./);

  // The page status lives outside the sheet, so it is not inside the hidden body.
  await expect(page.locator(".sheet__body")).toBeHidden();
  await expect(announcer(page)).toHaveText("The map shows everywhere within 10 minutes of the meeting point.");
  expect(await announcer(page).evaluate((el) => el.closest(".sheet__body") === null && el.closest(".sheet") === null)).toBe(true);
  await expect(page.locator(".leaflet-overlay-pane path.map-isochrone")).toHaveCount(1);

  // Submit from the peek summary: the sheet opens and focus moves to the form's button.
  await page.locator(".sheet__summary").getByRole("button", { name: "Find meeting points" }).focus();
  await submitAndSettle(page, () => page.keyboard.press("Enter"));
  await expect(sheet).toHaveAttribute("data-snap", "half");
  // Success moved focus to the results heading. Keep submitting from the
  // form's button with the keyboard until the limiter refuses.
  const submit = submitButton(page);
  await searchUntilRateLimited(page, async () => {
    await submit.focus();
    await page.keyboard.press("Enter");
  });
  await expect(submit).toBeFocused();
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-disabled"))).toBe("true");

  // Enter while blocked: no search, focus stays put. (A search would issue its
  // server call synchronously from the submit handler.)
  let serverCalls = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().startsWith(E2E.baseURL)) serverCalls += 1;
  });
  await page.keyboard.press("Enter");
  await expect(resultsPanel(page)).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".countdown")).toBeVisible();
  await expect(submit).toBeFocused();
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  expect(serverCalls, "searches started while blocked").toBe(0);
});

test("no API key in anything the browser receives", async ({ page }) => {
  const scanned: { url: string; type: string; leaks: string[] }[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", (res) => {
    if (!res.url().startsWith(E2E.baseURL)) return;
    const type = res.request().resourceType();
    if (!["document", "script", "stylesheet", "fetch", "xhr"].includes(type)) return;
    pending.push(
      res
        .body()
        .then((buf) => {
          const text = buf.toString("utf8");
          // Also decode inline source maps, whose sourcesContent is base64.
          const maps = [...text.matchAll(/sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)/g)].map(
            (m) => Buffer.from(m[1], "base64").toString("utf8"),
          );
          const haystack = [text, ...maps].join("\n");
          const leaks = [E2E.apiKey, "ORS_API_KEY"].filter((s) => haystack.includes(s));
          scanned.push({ url: res.url(), type, leaks });
        })
        .catch(() => undefined), // redirects / bodiless responses
    );
  });

  await openApp(page);
  await addPeople(page, NORWICH, CAMBRIDGE);
  await submitAndSettle(page, () => submitButton(page).click());
  const buttons = await expectRankedResults(page);
  await buttons.first().click();
  await expect(page.locator(".leaflet-overlay-pane path.map-isochrone")).toHaveCount(1);
  await Promise.all(pending);

  expect(scanned.filter((s) => s.type === "document").length).toBeGreaterThan(0);
  expect(scanned.filter((s) => s.type === "script").length).toBeGreaterThan(5);
  // geocode x2, find, isochrone: all server-function responses were scanned too.
  expect(scanned.filter((s) => s.type === "fetch").length).toBeGreaterThanOrEqual(4);
  expect(scanned.filter((s) => s.leaks.length > 0)).toEqual([]);
});
