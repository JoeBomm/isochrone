import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

it("has the CACHE KV binding", async () => {
  await env.CACHE.put("k", "v");
  expect(await env.CACHE.get("k")).toBe("v");
});
