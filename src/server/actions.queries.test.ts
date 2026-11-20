import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards that the client calls the three server functions as data-only
 * queries (no page re-render per call), with POST (arguments in the body,
 * never in the URL).
 *
 * rwsdk decides this at build time: its Vite transform finds
 * `export const NAME = serverQuery(..., { method: "POST" })` syntactically and
 * emits `createServerReference(id, NAME, "POST", "query")` for the client;
 * source "query" is what makes the client send `x-rsc-data-only: true`
 * (rwsdk/dist/runtime/client/client.js). A plain `export async function`
 * becomes source "action" (full page re-render).
 *
 * This runs the real transform on actions.ts. It imports an internal rwsdk
 * module by path (it is not in the package's exports map); if an rwsdk
 * upgrade moves it, re-check how serverQuery is detected and update this.
 */

const SOURCE_PATH = fileURLToPath(new URL("./actions.ts", import.meta.url));
const TRANSFORM_PATH = fileURLToPath(
  new URL("../../node_modules/rwsdk/dist/vite/transformServerFunctions.mjs", import.meta.url),
);
const ID = "/src/server/actions.ts";
const NAMES = ["findMeetingPointsAction", "getIsochroneAction", "geocodeAction"];

type Transform = (
  code: string,
  id: string,
  environment: "client" | "ssr" | "worker",
  serverFiles: Set<string>,
) => { code: string } | undefined;

async function clientStub(code: string): Promise<string> {
  const { transformServerFunctions } = (await import(/* @vite-ignore */ TRANSFORM_PATH)) as {
    transformServerFunctions: Transform;
  };
  const out = transformServerFunctions(code, ID, "client", new Set([ID]));
  expect(out, "actions.ts must be a 'use server' module").toBeDefined();
  return out!.code;
}

describe("actions.ts client stubs", () => {
  it.each(NAMES)("%s is a data-only POST query on the client", async (name) => {
    const stub = await clientStub(readFileSync(SOURCE_PATH, "utf8"));
    expect(stub).toContain(
      `export let ${name} = createServerReference(${JSON.stringify(ID)}, ${JSON.stringify(name)}, "POST", "query");`,
    );
  });

  it("detects a plain server function as a page-rendering action (the check above can fail)", async () => {
    const stub = await clientStub(
      `"use server";\nexport async function geocodeAction(q: string) { return q; }\n`,
    );
    expect(stub).toContain(`createServerReference(${JSON.stringify(ID)}, "geocodeAction");`);
  });
});
