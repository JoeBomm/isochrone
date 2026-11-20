import type { Coordinate, TravelMode } from "../../domain/types";
import { OrsError } from "./errors";

export interface GeoPolygon {
  type: "Polygon";
  coordinates: number[][][];
}
export interface GeoMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

export interface OrsClient {
  /** Seconds, [origin][destination]; null = unreachable. */
  matrix(
    origins: Coordinate[],
    destinations: Coordinate[],
    mode: TravelMode,
  ): Promise<(number | null)[][]>;
  isochrone(
    center: Coordinate,
    minutes: number,
    mode: TravelMode,
  ): Promise<GeoPolygon | GeoMultiPolygon>;
  geocode(query: string): Promise<{ coordinate: Coordinate; label: string }[]>;
}

export interface OrsClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

/**
 * HeiGIT unified host. api.openrouteservice.org is deprecated (reduced quota,
 * to be shut down); its quota on this host is the one shown in the dashboard.
 * Paths are api.heigit.org/<service>/<version>/..., see
 * https://ask.openrouteservice.org/t/deprecating-api-openrouteservice-org-in-favour-of-api-heigit-org/7912
 */
export const ORS_BASE_URL = "https://api.heigit.org";
const ORS_PATH = "/openrouteservice/v2"; // matrix, isochrones
const GEOCODE_PATH = "/pelias/v1"; // was /geocode on the old host

/**
 * Docs checked 2026-11-19:
 * - Hosted API restrictions (matrix: max 3,500 routes = sources x destinations
 *   per request): https://giscience.github.io/openrouteservice/hosted-api-restrictions
 * - Matrix body (locations/sources/destinations/metrics, durations in seconds):
 *   https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/
 * - Auth: ORS docs (https://openrouteservice.org/dev/#/api-docs) say GET
 *   endpoints accept the key as `api_key` OR the Authorization header; POST
 *   requires the Authorization header. We use the header for all calls. The
 *   header value is the bare key (as in the ORS docs examples), not "Bearer".
 */
export const MATRIX_MAX_ROUTES = 3500;

function toLngLat(c: Coordinate): [number, number] {
  return [c.lng, c.lat];
}

function errorForStatus(status: number, retryAfter: string | null): OrsError {
  if (status === 429) {
    const secs = retryAfter !== null ? Number(retryAfter) : NaN;
    return new OrsError(
      "rate_limited",
      "OpenRouteService rate limit reached (HTTP 429)",
      Number.isFinite(secs) && secs >= 0 ? secs : undefined,
    );
  }
  if (status === 401 || status === 403) {
    return new OrsError("unauthorized", `OpenRouteService rejected credentials (HTTP ${status})`);
  }
  if (status === 404) return new OrsError("not_found", "OpenRouteService resource not found (HTTP 404)");
  if (status >= 500) return new OrsError("upstream", `OpenRouteService upstream error (HTTP ${status})`);
  return new OrsError("bad_request", `OpenRouteService rejected the request (HTTP ${status})`);
}

export function createOrsClient(opts: OrsClientOptions): OrsClient {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = (opts.baseUrl ?? ORS_BASE_URL).replace(/\/+$/, "");
  const authHeaders = { Authorization: opts.apiKey };

  async function request(url: string, init: RequestInit): Promise<any> {
    let res: Response;
    try {
      res = await doFetch(url, init);
    } catch {
      // Deliberately drop the original error: it may embed the URL/headers.
      throw new OrsError("upstream", "OpenRouteService request failed (network error)");
    }
    if (!res.ok) throw errorForStatus(res.status, res.headers.get("retry-after"));
    try {
      return await res.json();
    } catch {
      throw new OrsError("upstream", "OpenRouteService returned invalid JSON");
    }
  }

  return {
    async matrix(origins, destinations, mode) {
      const routes = origins.length * destinations.length;
      if (routes > MATRIX_MAX_ROUTES) {
        throw new OrsError(
          "bad_request",
          `Matrix request too large: ${routes} routes exceeds the ORS limit of ${MATRIX_MAX_ROUTES}`,
        );
      }
      const body = {
        locations: [...origins, ...destinations].map(toLngLat),
        sources: origins.map((_, i) => i),
        destinations: destinations.map((_, i) => origins.length + i),
        metrics: ["duration"],
      };
      const data = await request(`${baseUrl}${ORS_PATH}/matrix/${mode}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!Array.isArray(data?.durations)) {
        throw new OrsError("upstream", "OpenRouteService matrix response missing durations");
      }
      return data.durations.map((row: unknown) =>
        (row as (number | null | undefined)[]).map((d) => (typeof d === "number" ? d : null)),
      );
    },

    async isochrone(center, minutes, mode) {
      const data = await request(`${baseUrl}${ORS_PATH}/isochrones/${mode}`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json", Accept: "application/geo+json" },
        body: JSON.stringify({
          locations: [toLngLat(center)],
          range: [minutes * 60],
          range_type: "time",
          smoothing: 0.9,
        }),
      });
      const geom = data?.features?.[0]?.geometry;
      if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) {
        throw new OrsError("upstream", "OpenRouteService isochrone response has no polygon");
      }
      return geom;
    },

    async geocode(query) {
      const params = new URLSearchParams({
        text: query,
        size: "5",
        layers: "address,venue,street",
      });
      const data = await request(`${baseUrl}${GEOCODE_PATH}/search?${params}`, {
        method: "GET",
        headers: { ...authHeaders, Accept: "application/json" },
      });
      const features: any[] = Array.isArray(data?.features) ? data.features : [];
      return features.map((f) => {
        const [lng, lat] = f.geometry.coordinates as [number, number];
        return { coordinate: { lat, lng }, label: String(f.properties?.label ?? "") };
      });
    },
  };
}
