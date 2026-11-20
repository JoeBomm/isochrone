import type { Coordinate } from "./types";

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const EARTH_RADIUS_M = 6371008.8;
const MIN_SPAN_DEG = 0.01; // ~1.1 km minimum box span for degenerate input

const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function centroid(ps: Coordinate[]): Coordinate {
  const n = ps.length;
  return {
    lat: ps.reduce((s, p) => s + p.lat, 0) / n,
    lng: ps.reduce((s, p) => s + p.lng, 0) / n,
  };
}

/** Round both axes to `decimals` places ("+ 0" turns -0 into 0). */
export function roundCoordinate(c: Coordinate, decimals: number): Coordinate {
  const f = 10 ** decimals;
  return { lat: Math.round(c.lat * f) / f + 0, lng: Math.round(c.lng * f) / f + 0 };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function medianPoint(ps: Coordinate[]): Coordinate {
  return { lat: median(ps.map((p) => p.lat)), lng: median(ps.map((p) => p.lng)) };
}

export function pairwiseMidpoints(ps: Coordinate[]): Coordinate[] {
  const out: Coordinate[] = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      out.push({
        lat: (ps[i].lat + ps[j].lat) / 2,
        lng: (ps[i].lng + ps[j].lng) / 2,
      });
    }
  }
  return out;
}

export function boundingBox(ps: Coordinate[], paddingRatio = 0.1): BBox {
  let south = Math.min(...ps.map((p) => p.lat));
  let north = Math.max(...ps.map((p) => p.lat));
  let west = Math.min(...ps.map((p) => p.lng));
  let east = Math.max(...ps.map((p) => p.lng));
  const padLat = (north - south) * paddingRatio;
  const padLng = (east - west) * paddingRatio;
  south -= padLat;
  north += padLat;
  west -= padLng;
  east += padLng;
  // Enforce a minimum span so coincident/collinear points still form a box.
  if (north - south < MIN_SPAN_DEG) {
    const mid = (north + south) / 2;
    south = mid - MIN_SPAN_DEG / 2;
    north = mid + MIN_SPAN_DEG / 2;
  }
  if (east - west < MIN_SPAN_DEG) {
    const mid = (east + west) / 2;
    west = mid - MIN_SPAN_DEG / 2;
    east = mid + MIN_SPAN_DEG / 2;
  }
  return { south, west, north, east };
}

export function gridInBox(box: BBox, size: number): Coordinate[] {
  const out: Coordinate[] = [];
  const frac = (i: number) => (size > 1 ? i / (size - 1) : 0.5);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      out.push({
        lat: box.south + (box.north - box.south) * frac(i),
        lng: box.west + (box.east - box.west) * frac(j),
      });
    }
  }
  return out;
}
