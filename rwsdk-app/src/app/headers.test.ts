import { describe, expect, it } from "vitest";
import { TILE_URL } from "./components/MeetingMap";
import { setCommonHeaders, TILE_ORIGIN } from "./headers";

function csp(): string {
  const headers = new Headers();
  const mw = setCommonHeaders();
  (mw as (info: unknown) => void)({ response: { headers }, rw: { nonce: "n0nce" } });
  return headers.get("Content-Security-Policy")!;
}

const directive = (policy: string, name: string) =>
  policy
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));

describe("Content-Security-Policy", () => {
  it("allows images only from self and the one tile host (no wildcard, no data:)", () => {
    expect(directive(csp(), "img-src")).toBe(`img-src 'self' ${TILE_ORIGIN}`);
    expect(TILE_ORIGIN).toBe("https://tile.openstreetmap.org");
  });

  it("the tile host matches the map's tile URL", () => {
    expect(new URL(TILE_URL.replace(/\{[a-z]\}/g, "0")).origin).toBe(TILE_ORIGIN);
  });

  it("keeps every other directive as strict as before", () => {
    const policy = csp();
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(directive(policy, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(policy, "font-src")).toBe("font-src 'self'");
    expect(directive(policy, "script-src")).toBe(
      "script-src 'self' 'unsafe-eval' 'nonce-n0nce' https://challenges.cloudflare.com",
    );
    expect(directive(policy, "connect-src")).toBeUndefined();
    expect(policy).not.toContain("*");
  });
});
