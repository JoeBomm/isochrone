import { exports } from "cloudflare:workers";
import { expect, it } from "vitest";

// Locks in the server-rendered first paint of "/": the form (and its primary
// action) is in the HTML before any client JavaScript runs. Runs against the
// built worker (npm run test:worker builds first).
it("GET / server-renders the form with the primary action", async () => {
  const res = await exports.default.fetch(new Request("https://example.com/"));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  const html = await res.text();
  expect(html).toContain("Find meeting points");
  expect(html).toContain("Starting address");
  expect(html).toContain('class="meeting-map"');
  // Leaflet never runs on the server: the map container is empty.
  expect(html).not.toContain("leaflet-container");
});
