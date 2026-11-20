import { describe, expect, it } from "vitest";
import tokensCss from "../styles/tokens.css?raw";
import {
  boundsOf,
  medianFitBounds,
  errorCopy,
  formatMinutes,
  geometryCoordinates,
  isDebugSearch,
  longestIndexes,
  MIN_STRIP_PERCENT,
  RATE_LIMIT_FALLBACK_SECONDS,
  retrySeconds,
  secondsLabel,
  sheetInsetPx,
  stripPercent,
  timeScale,
} from "./results";

const point = (id: string, perPersonSeconds: number[]) => ({
  id,
  coordinate: { lat: 0, lng: 0 },
  kind: "GRID" as const,
  perPersonSeconds,
  max: Math.max(...perPersonSeconds),
  mean: perPersonSeconds.reduce((a, b) => a + b, 0) / perPersonSeconds.length,
  total: perPersonSeconds.reduce((a, b) => a + b, 0),
  variance: 0,
  score: 0,
});

describe("timeScale", () => {
  it("is the largest per-person time across ALL results", () => {
    expect(timeScale([point("a", [600, 1200]), point("b", [1800, 300])])).toBe(1800);
  });

  it("never returns zero (everyone already at the point) or less than one second", () => {
    expect(timeScale([point("a", [0, 0])])).toBe(1);
    expect(timeScale([])).toBe(1);
  });
});

describe("stripPercent", () => {
  it("is proportional to the shared scale", () => {
    expect(stripPercent(900, 1800)).toBe(50);
    expect(stripPercent(1800, 1800)).toBe(100);
  });

  it("keeps a visible stub for zero and clamps to 100", () => {
    expect(stripPercent(0, 1800)).toBe(MIN_STRIP_PERCENT);
    expect(stripPercent(5000, 1800)).toBe(100);
    expect(stripPercent(Number.NaN, 1800)).toBe(MIN_STRIP_PERCENT);
  });
});

describe("formatMinutes", () => {
  it("rounds seconds to whole minutes", () => {
    expect(formatMinutes(2040)).toBe("34");
    expect(formatMinutes(89)).toBe("1");
    expect(formatMinutes(90)).toBe("2");
  });

  it("says <1 for a short non-zero trip and 0 for none", () => {
    expect(formatMinutes(20)).toBe("<1");
    expect(formatMinutes(0)).toBe("0");
  });
});

describe("longestIndexes", () => {
  it("returns every person tied for the longest time", () => {
    expect(longestIndexes([10, 30, 30, 5])).toEqual([1, 2]);
    expect(longestIndexes([42])).toEqual([0]);
    expect(longestIndexes([])).toEqual([]);
  });
});

describe("isDebugSearch", () => {
  it("is true only for debug=1", () => {
    expect(isDebugSearch("?debug=1")).toBe(true);
    expect(isDebugSearch("?a=b&debug=1")).toBe(true);
    expect(isDebugSearch("debug=1")).toBe(true);
    expect(isDebugSearch("")).toBe(false);
    expect(isDebugSearch("?debug=0")).toBe(false);
    expect(isDebugSearch("?debug=true")).toBe(false);
    expect(isDebugSearch("?debug")).toBe(false);
    expect(isDebugSearch("?xdebug=1")).toBe(false);
  });
});

describe("retrySeconds / secondsLabel", () => {
  it("uses the server's retry-after, rounded up, with a fallback", () => {
    expect(retrySeconds(12)).toBe(12);
    expect(retrySeconds(2.2)).toBe(3);
    expect(retrySeconds(undefined)).toBe(RATE_LIMIT_FALLBACK_SECONDS);
    expect(retrySeconds(0)).toBe(1);
    expect(retrySeconds(Number.NaN)).toBe(RATE_LIMIT_FALLBACK_SECONDS);
  });

  it("pluralises", () => {
    expect(secondsLabel(1)).toBe("1 second");
    expect(secondsLabel(5)).toBe("5 seconds");
  });
});

describe("errorCopy", () => {
  it("gives every find error code its own message from the UX direction", () => {
    const codes = ["no_reachable_point", "quota", "upstream", "not_found"] as const;
    const messages = codes.map((code) => errorCopy({ code, message: "server text" }).message);
    expect(new Set(messages).size).toBe(messages.length - 1); // not_found falls back to generic
    expect(errorCopy({ code: "no_reachable_point", message: "x" }).message).toBe(
      "No place is reachable for everyone by this travel mode. Try another mode or move a start point.",
    );
    expect(errorCopy({ code: "quota", message: "x" }).message).toBe(
      "The route service has reached its daily limit. Try again later.",
    );
    expect(errorCopy({ code: "upstream", message: "x" })).toEqual({
      message: "Something went wrong on our side. Try again.",
      retry: true,
    });
  });

  it("shows the server's own (human-readable) validation message", () => {
    expect(errorCopy({ code: "validation", message: "Use fewer participants." })).toEqual({
      message: "Use fewer participants.",
      retry: false,
    });
  });

  it("formats the rate-limit countdown", () => {
    expect(errorCopy({ code: "rate_limited", message: "x" }, 4).message).toBe(
      "You're searching too fast. Try again in 4 seconds.",
    );
  });
});

describe("boundsOf", () => {
  it("returns south-west and north-east corners", () => {
    expect(
      boundsOf([
        { lat: 52.6, lng: 1.3 },
        { lat: 51.7, lng: -1.2 },
        { lat: 52.2, lng: 0.1 },
      ]),
    ).toEqual([
      [51.7, -1.2],
      [52.6, 1.3],
    ]);
  });

  it("is null for no coordinates and ignores non-finite ones", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ lat: Number.NaN, lng: 0 }])).toBeNull();
    expect(boundsOf([{ lat: 1, lng: 2 }, { lat: Number.NaN, lng: 5 }])).toEqual([
      [1, 2],
      [1, 2],
    ]);
  });
});

describe("medianFitBounds", () => {
  it("is a point box for one location", () => {
    expect(medianFitBounds([{ lat: 10, lng: 20 }])).toEqual([
      [10, 20],
      [10, 20],
    ]);
  });

  it("centres on the median, not the mean, and contains every point", () => {
    const pts = [
      { lat: 50, lng: 0 },
      { lat: 50.01, lng: 0.01 },
      { lat: 60, lng: 20 },
    ];
    const [[s, w], [n, e]] = medianFitBounds(pts)!;
    expect((s + n) / 2).toBeCloseTo(50.01);
    expect((w + e) / 2).toBeCloseTo(0.01);
    for (const p of pts) {
      expect(p.lat).toBeGreaterThanOrEqual(s);
      expect(p.lat).toBeLessThanOrEqual(n);
      expect(p.lng).toBeGreaterThanOrEqual(w);
      expect(p.lng).toBeLessThanOrEqual(e);
    }
  });

  it("is null for nothing usable", () => {
    expect(medianFitBounds([])).toBeNull();
    expect(medianFitBounds([{ lat: Number.NaN, lng: 0 }])).toBeNull();
  });
});

describe("geometryCoordinates", () => {
  it("flattens Polygon and MultiPolygon rings into {lat,lng} (GeoJSON is [lng,lat])", () => {
    expect(
      geometryCoordinates({ type: "Polygon", coordinates: [[[1, 50], [2, 51], [1, 50]]] }),
    ).toEqual([
      { lat: 50, lng: 1 },
      { lat: 51, lng: 2 },
      { lat: 50, lng: 1 },
    ]);
    expect(
      geometryCoordinates({
        type: "MultiPolygon",
        coordinates: [[[[1, 50], [2, 51]]], [[[3, 52]]]],
      }),
    ).toEqual([
      { lat: 50, lng: 1 },
      { lat: 51, lng: 2 },
      { lat: 52, lng: 3 },
    ]);
  });
});

describe("sheetInsetPx", () => {
  it("is zero on desktop, where the panel sits beside the map", () => {
    expect(sheetInsetPx("half", { width: 1280, height: 800, rem: 16 })).toBe(0);
  });

  it("uses the same peek height as the --sheet-peek token", () => {
    const rem = Number(/--sheet-peek:\s*([\d.]+)rem/.exec(tokensCss)?.[1]);
    expect(sheetInsetPx("peek", { width: 375, height: 812, rem: 16 })).toBe(rem * 16);
  });

  it("matches the sheet heights on mobile", () => {
    const vp = { width: 375, height: 812, rem: 16 };
    expect(sheetInsetPx("peek", vp)).toBe(152); // --sheet-peek 9.5rem
    expect(sheetInsetPx("half", vp)).toBe(406); // 50dvh
    expect(sheetInsetPx("full", vp)).toBe(406); // map hidden; keep the half framing
  });
});
