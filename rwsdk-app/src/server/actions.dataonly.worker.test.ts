import { exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

// End-to-end through the BUILT worker (dist/worker): calls the server
// functions the way rwsdk's client runtime does for a serverQuery with
// method POST (client.js fetchCallServer): POST /?__rsc&__rsc_action_id=<id>
// with the encoded args in the body and `x-rsc-data-only: true`.
//
// What changed the client's behaviour (source "query" -> data-only header) is
// guarded by actions.queries.test.ts; this file checks the server side of the
// contract: the header suppresses the page render, the functions only accept
// same-origin POST, and the envelope comes back as data.
//
// The test env has no ORS_API_KEY, so each call returns the "configuration"
// envelope without any ORS request. That is enough to see the envelope come
// back as data and to check whether the page was rendered.

const ACTIONS = "/src/server/actions.ts";

function call(name: string, args: unknown[], init: { method?: string; dataOnly?: boolean } = {}) {
  const url = new URL("http://localhost/");
  url.searchParams.set("__rsc", "");
  url.searchParams.set("__rsc_action_id", `${ACTIONS}#${name}`);
  const method = init.method ?? "POST";
  if (method === "GET") url.searchParams.set("args", JSON.stringify(args));
  const headers = new Headers({ Origin: "http://localhost", "CF-Connecting-IP": `198.51.100.${name.length}` });
  if (init.dataOnly ?? true) headers.set("x-rsc-data-only", "true");
  return exports.default.fetch(
    new Request(url, {
      method,
      headers,
      // encodeReply() of plain JSON arguments is their JSON text.
      body: method === "GET" ? undefined : JSON.stringify(args),
    }),
  );
}

describe("server functions are data-only POST queries", () => {
  const cases: Array<[string, unknown[]]> = [
    ["geocodeAction", ["Berlin"]],
    ["findMeetingPointsAction", [{ participants: [{ lat: 52.52, lng: 13.405 }, { lat: 52.5, lng: 13.3 }] }]],
    ["getIsochroneAction", [{ center: { lat: 52.52, lng: 13.405 }, minutes: 10 }]],
  ];

  it.each(cases)("%s returns its envelope without rendering the page", async (name, args) => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call(name, args);
    err.mockRestore();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/x-component");
    const body = await res.text();
    // The ActionResult envelope is returned as data, not thrown.
    expect(body).toContain('"ok":false');
    expect(body).toContain('"code":"upstream"');
    // No page tree in the payload. "/" renders the client HomePage, so a page
    // render shows up as its client reference ("HomePage.tsx#HomePage").
    expect(body).not.toContain("HomePage");
    expect(body).not.toContain("Halfway");
    expect(body).not.toContain("app-title");
  });

  it("a request without the data-only header does render the page (the check above can fail)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call("geocodeAction", ["Berlin"], { dataOnly: false });
    err.mockRestore();
    const body = await res.text();
    expect(body).toContain('"code":"upstream"');
    expect(body).toContain("HomePage.tsx#HomePage");
  });

  // rwsdk turns a Response returned by its action handler into
  // `{ __rw_action_response: { status } }` inside a 200 RSC payload; the
  // client runtime then throws "Server function returned status N".
  it.each(cases)("%s rejects GET, so arguments never travel in the URL", async (name, args) => {
    const res = await call(name, args, { method: "GET" });
    const body = await res.text();
    expect(body).toContain('"__rw_action_response"');
    expect(body).toContain('"status":405');
    expect(body).not.toContain('"ok":');
  });

  it("rejects a cross-origin POST before running the function", async () => {
    const url = new URL("http://localhost/");
    url.searchParams.set("__rsc", "");
    url.searchParams.set("__rsc_action_id", `${ACTIONS}#geocodeAction`);
    const res = await exports.default.fetch(
      new Request(url, {
        method: "POST",
        headers: { Origin: "https://evil.example", "x-rsc-data-only": "true" },
        body: JSON.stringify(["Berlin"]),
      }),
    );
    const body = await res.text();
    expect(body).toContain('"__rw_action_response"');
    expect(body).toContain('"status":403');
    expect(body).not.toContain('"ok":');
  });
});
