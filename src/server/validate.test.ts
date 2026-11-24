import { describe, expect, it } from "vitest";
import {
  DEDUP_THRESHOLD_METERS,
  GEOCODE_QUERY_MAX_LENGTH,
  GRID_SIZE,
  ISOCHRONE_MINUTES,
  MAX_PARTICIPANTS,
  TOP_M,
} from "../domain/constants";
import { MATRIX_MAX_ROUTES } from "./ors/client";
import { ValidationError } from "./findMeetingPoints";
import {
  matrixRoutes,
  parseFindInput,
  parseGeocodeInput,
  parseGeocodeQuery,
  parseIsochroneInput,
} from "./validate";

const A = { lat: 40, lng: -70 };
const B = { lat: 40.1, lng: -70.1 };
const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 40 + i * 0.01, lng: -70 }));
const ok = { participants: [A, B], mode: "driving-car", goal: "MINIMAX" };

const rejects = (f: () => unknown) => expect(f).toThrow(ValidationError);

describe("parseFindInput", () => {
  it("accepts a minimal valid input and fills defaults from the constants", () => {
    expect(parseFindInput(ok)).toEqual({
      participants: [A, B],
      mode: "driving-car",
      goal: "MINIMAX",
      topM: TOP_M,
      gridSize: GRID_SIZE,
      dedupeMeters: DEDUP_THRESHOLD_METERS,
    });
  });

  it("defaults mode and goal when omitted", () => {
    const r = parseFindInput({ participants: [A, B] });
    expect(r.mode).toBe("driving-car");
    expect(r.goal).toBe("MINIMAX");
  });

  it("strips unknown keys at every level and returns fresh objects", () => {
    const input = {
      ...ok,
      evil: "x",
      participants: [{ ...A, extra: 1 }, B],
    };
    const r = parseFindInput(input);
    expect(r).not.toHaveProperty("evil");
    expect(r.participants[0]).toEqual(A);
    expect(r.participants[0]).not.toBe(input.participants[0]);
  });

  it.each([
    ["non-object", 42],
    ["null", null],
    ["array", [A, B]],
    ["participants not an array", { participants: "A,B" }],
    ["1 participant", { participants: [A] }],
    ["0 participants", { participants: [] }],
    ["too many participants", { participants: pts(MAX_PARTICIPANTS + 1) }],
    ["lat > 90", { participants: [{ lat: 90.0001, lng: 0 }, B] }],
    ["lat < -90", { participants: [{ lat: -91, lng: 0 }, B] }],
    ["lng > 180", { participants: [{ lat: 0, lng: 180.5 }, B] }],
    ["lng < -180", { participants: [{ lat: 0, lng: -181 }, B] }],
    ["NaN lat", { participants: [{ lat: NaN, lng: 0 }, B] }],
    ["Infinity lng", { participants: [{ lat: 0, lng: Infinity }, B] }],
    ["string lat", { participants: [{ lat: "40", lng: 0 }, B] }],
    ["null participant", { participants: [null, B] }],
    ["missing lng", { participants: [{ lat: 1 }, B] }],
    ["unknown mode", { ...ok, mode: "driving-hgv" }],
    ["mode wrong type", { ...ok, mode: 1 }],
    ["unknown goal", { ...ok, goal: "MAXIMIZE_FUN" }],
    ["gridSize too small", { ...ok, gridSize: 1 }],
    ["gridSize too big", { ...ok, gridSize: 21 }],
    ["gridSize non-integer", { ...ok, gridSize: 5.5 }],
    ["topM 0", { ...ok, topM: 0 }],
    ["topM 51", { ...ok, topM: 51 }],
    ["topM string", { ...ok, topM: "3" }],
    ["dedupeMeters too small", { ...ok, dedupeMeters: 99 }],
    ["dedupeMeters too big", { ...ok, dedupeMeters: 50001 }],
    ["dedupeMeters NaN", { ...ok, dedupeMeters: NaN }],
  ])("rejects %s", (_name, input) => {
    rejects(() => parseFindInput(input));
  });

  it("accepts boundary coordinates and the participant cap", () => {
    expect(() =>
      parseFindInput({ participants: [{ lat: 90, lng: 180 }, { lat: -90, lng: -180 }] }),
    ).not.toThrow();
    expect(() => parseFindInput({ participants: pts(MAX_PARTICIPANTS) })).not.toThrow();
  });

  it("matrixRoutes matches participants x (centroid + median + n + n(n-1)/2 + g^2)", () => {
    expect(matrixRoutes(3, 5)).toBe(3 * (2 + 3 + 3 + 25));
    expect(matrixRoutes(17, 7)).toBeLessThanOrEqual(MATRIX_MAX_ROUTES);
    expect(matrixRoutes(18, 7)).toBeGreaterThan(MATRIX_MAX_ROUTES);
    expect(matrixRoutes(7, 20)).toBeLessThanOrEqual(MATRIX_MAX_ROUTES);
    expect(matrixRoutes(8, 20)).toBeGreaterThan(MATRIX_MAX_ROUTES);
  });

  it("rejects participant/gridSize combinations that would exceed the ORS 3,500-route matrix limit", () => {
    expect(() => parseFindInput({ participants: pts(7), gridSize: 20 })).not.toThrow();
    expect(() => parseFindInput({ participants: pts(8), gridSize: 20 })).toThrow(/too large|fewer/i);
    expect(() => parseFindInput({ participants: pts(MAX_PARTICIPANTS), gridSize: GRID_SIZE })).not.toThrow();
  });
});

describe("parseIsochroneInput", () => {
  const iso = { center: A, minutes: 15, mode: "foot-walking" };

  it("accepts valid input and strips unknown keys", () => {
    const r = parseIsochroneInput({ ...iso, junk: true, center: { ...A, z: 1 } });
    expect(r).toEqual(iso);
  });

  it("defaults mode", () => {
    expect(parseIsochroneInput({ center: A, minutes: 10 }).mode).toBe("driving-car");
  });

  it.each([
    ["minutes 0", { ...iso, minutes: 0 }],
    ["minutes below min", { ...iso, minutes: ISOCHRONE_MINUTES.MIN - 1 }],
    ["minutes above max", { ...iso, minutes: ISOCHRONE_MINUTES.MAX + 1 }],
    ["minutes non-integer", { ...iso, minutes: 7.5 }],
    ["minutes missing", { center: A, mode: "driving-car" }],
    ["minutes string", { ...iso, minutes: "15" }],
    ["center out of range", { ...iso, center: { lat: 95, lng: 0 } }],
    ["center missing", { minutes: 15 }],
    ["bad mode", { ...iso, mode: "plane" }],
    ["not an object", "x"],
  ])("rejects %s", (_name, input) => {
    rejects(() => parseIsochroneInput(input));
  });

  it("accepts the minutes bounds", () => {
    expect(() => parseIsochroneInput({ ...iso, minutes: ISOCHRONE_MINUTES.MIN })).not.toThrow();
    expect(() => parseIsochroneInput({ ...iso, minutes: ISOCHRONE_MINUTES.MAX })).not.toThrow();
  });
});

describe("parseGeocodeInput", () => {
  it("accepts a bare string or { text, focus? }", () => {
    expect(parseGeocodeInput("  Berlin ")).toEqual({ text: "Berlin" });
    expect(parseGeocodeInput({ text: "Berlin" })).toEqual({ text: "Berlin" });
    expect(parseGeocodeInput({ text: "Berlin", focus: null })).toEqual({ text: "Berlin" });
    expect(parseGeocodeInput({ text: "Berlin", focus: { lat: 52.5, lng: 13.4 } })).toEqual({
      text: "Berlin",
      focus: { lat: 52.5, lng: 13.4 },
    });
  });

  it("rejects bad text and bad focus", () => {
    expect(() => parseGeocodeInput({ text: "" })).toThrow(ValidationError);
    expect(() => parseGeocodeInput(42)).toThrow(ValidationError);
    expect(() => parseGeocodeInput({ text: "x", focus: { lat: 0, lng: 181 } })).toThrow(ValidationError);
    expect(() => parseGeocodeInput({ text: "x", focus: "here" })).toThrow(ValidationError);
  });
});

describe("parseGeocodeQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(parseGeocodeQuery("  10  Downing   Street\n London ")).toBe("10 Downing Street London");
  });

  it("accepts a query exactly at the cap", () => {
    expect(parseGeocodeQuery("a".repeat(GEOCODE_QUERY_MAX_LENGTH))).toHaveLength(GEOCODE_QUERY_MAX_LENGTH);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   \t\n "],
    ["500 chars", "a".repeat(500)],
    ["one over the cap", "a".repeat(GEOCODE_QUERY_MAX_LENGTH + 1)],
    ["non-string", 123],
    ["null", null],
  ])("rejects %s", (_name, q) => {
    rejects(() => parseGeocodeQuery(q));
  });
});

describe("parseFindInput placeType", () => {
  const two = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
  it("omits placeType and minutes when not given (unchanged shape)", () => {
    const r = parseFindInput({ participants: two });
    expect("placeType" in r).toBe(false);
    expect("minutes" in r).toBe(false);
  });
  it("accepts a known type with default and explicit minutes", () => {
    expect(parseFindInput({ participants: two, placeType: "cafe" })).toMatchObject({ placeType: "cafe", minutes: 15 });
    expect(parseFindInput({ participants: two, placeType: "gym", minutes: 20 })).toMatchObject({ minutes: 20 });
  });
  it("rejects unknown types and bad minutes", () => {
    expect(() => parseFindInput({ participants: two, placeType: "casino" })).toThrow(/placeType/);
    expect(() => parseFindInput({ participants: two, placeType: "bar", minutes: 0 })).toThrow(/minutes/);
  });
});
