"use client";

import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { Candidate, Coordinate } from "@/domain/types";
import { cspSafeTileLayer } from "./leafletTiles";
import { personColourIndex, personShape, type PersonSummary } from "./participants";
import {
  boundsOf,
  DESKTOP_MIN_WIDTH,
  formatMinutes,
  geometryCoordinates,
  type IsochroneGeometry,
  type ScoredCandidate,
} from "./results";

/**
 * Tiles: OpenStreetMap's standard tile server. Its usage policy (checked
 * 2026-11-19, https://operations.osmfoundation.org/policies/tiles/) allows
 * websites that show visible attribution, let the browser cache tiles, do not
 * bulk-download or prefetch, and send a valid Referer. The app sends
 * `Referrer-Policy: no-referrer` (headers.ts), so the tile images opt back in
 * with `referrerpolicy="strict-origin-when-cross-origin"`: only the site's
 * origin is sent to the tile host, nothing else changes. The CSP allows this
 * one host in img-src. Change the provider here (and in headers.ts).
 */
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const TILE_MAX_ZOOM = 19;

/** Neutral world view before anyone has searched. */
const DEFAULT_CENTER: [number, number] = [30, 0];
const DEFAULT_ZOOM = 2;
/**
 * Starting zoom around the visitor's approximate location: about a county
 * (~100 km across on desktop, ~45 km on a phone, at mid latitudes).
 */
export const LOCAL_ZOOM = 10;
/** Never zoom in further than this when fitting (e.g. everyone at one spot). */
const FIT_MAX_ZOOM = 15;
const EDGE_PADDING = 32;

export interface MeetingMapProps {
  /** Where to start (read once, when the map is created); the world view if absent. */
  initialCenter?: Coordinate;
  /** Submitted start points, same order as `people`. */
  participants: readonly Coordinate[];
  people: readonly PersonSummary[];
  /** Ranked results (rank = index + 1). */
  results: readonly ScoredCandidate[];
  selectedId: string | null;
  onSelect: (point: ScoredCandidate) => void;
  /** Polygon for the selected result, or null. */
  isochrone: IsochroneGeometry | null;
  /** Only with ?debug=1: every evaluated candidate. */
  debugCandidates?: readonly Candidate[];
  /** Map pixels hidden under the mobile sheet (0 on desktop). */
  bottomInset: number;
}

interface MapApi {
  L: typeof Leaflet;
  map: Leaflet.Map;
  participants: Leaflet.LayerGroup;
  results: Leaflet.LayerGroup;
  isochrone: Leaflet.LayerGroup;
  debug: Leaflet.LayerGroup;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Leaflet map: start points, ranked meeting points, the selected point's
 * isochrone and (debug only) every candidate. Supplementary to the ranked
 * list, which carries the same information as text.
 *
 * Client-only: Leaflet touches `window` when it is evaluated, so it is loaded
 * with a dynamic import inside an effect. Effects never run during SSR, so
 * the server renders only the empty container (styled as a neutral chart-paper
 * background). rwsdk has no per-component "no SSR" switch (only a per-route
 * `render(..., { ssr: false })`), and the rest of the page should SSR.
 *
 * Keyboard: the map container is focusable (arrow keys pan, +/- zoom) and Tab
 * leaves it normally. Result markers are focusable buttons (Enter/Space
 * select, aria-pressed shows the selection). Start markers are not
 * interactive. Under prefers-reduced-motion all map animation is off.
 */
export function MeetingMap(props: MeetingMapProps) {
  // bottomInset is read through `latest` when a fit runs, so a sheet move
  // alone does not refit the map.
  const { participants, people, results, selectedId, isochrone, debugCandidates } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<MapApi | null>(null);
  const [failed, setFailed] = useState(false);
  // Latest props for Leaflet event handlers and fits, without re-binding.
  const latest = useRef(props);
  latest.current = props;
  const resultMarkers = useRef(new Map<string, Leaflet.Marker>());

  // Create the map once, on the client only.
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | undefined;
    let mql: MediaQueryList | undefined;
    let onBreakpoint: (() => void) | undefined;
    import("leaflet")
      .then((mod) => {
        const container = containerRef.current;
        if (cancelled || !container) return;
        const L = ((mod as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
        const reduced = prefersReducedMotion();
        const start = latest.current.initialCenter;
        map = L.map(container, {
          center: start ? [start.lat, start.lng] : DEFAULT_CENTER,
          zoom: start ? LOCAL_ZOOM : DEFAULT_ZOOM,
          zoomAnimation: !reduced,
          fadeAnimation: !reduced,
          markerZoomAnimation: !reduced,
          attributionControl: false,
        });
        // On mobile the bottom of the map is under the sheet: shift the
        // start point up into the visible part (as for a selected result).
        const inset = latest.current.bottomInset;
        if (start && inset > 0) map.panBy([0, inset / 2], { animate: false });
        container.setAttribute("role", "group");
        container.setAttribute("aria-label", "Map. Arrow keys pan, plus and minus keys zoom.");

        const TileLayer = cspSafeTileLayer(L);
        new TileLayer(TILE_URL, {
          maxZoom: TILE_MAX_ZOOM,
          attribution: TILE_ATTRIBUTION,
          referrerPolicy: "strict-origin-when-cross-origin",
        } as Leaflet.TileLayerOptions).addTo(map);

        // Attribution must stay visible: on mobile the bottom of the map is
        // under the sheet, so it moves to the top right there.
        const attribution = L.control
          .attribution({ prefix: '<a href="https://leafletjs.com">Leaflet</a>' })
          .addTo(map);
        mql = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
        onBreakpoint = () => attribution.setPosition(mql!.matches ? "bottomright" : "topright");
        onBreakpoint();
        mql.addEventListener?.("change", onBreakpoint);

        // Pane order (all SVG in the overlay pane): isochrone below debug points.
        const isochroneLayer = L.layerGroup().addTo(map);
        const debugLayer = L.layerGroup().addTo(map);
        setApi({
          L,
          map,
          isochrone: isochroneLayer,
          debug: debugLayer,
          participants: L.layerGroup().addTo(map),
          results: L.layerGroup().addTo(map),
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (mql && onBreakpoint) mql.removeEventListener?.("change", onBreakpoint);
      map?.remove();
    };
  }, []);

  const padding = (): Leaflet.FitBoundsOptions => ({
    paddingTopLeft: [EDGE_PADDING, EDGE_PADDING],
    paddingBottomRight: [EDGE_PADDING, EDGE_PADDING + latest.current.bottomInset],
    maxZoom: FIT_MAX_ZOOM,
  });

  const fit = (coords: readonly Coordinate[]) => {
    if (!api) return;
    const b = boundsOf(coords);
    if (!b) return;
    const reduced = prefersReducedMotion();
    if (reduced) api.map.fitBounds(b, { ...padding(), animate: false });
    else api.map.flyToBounds(b, { ...padding(), duration: 0.6 });
  };

  // Start markers.
  useEffect(() => {
    if (!api) return;
    const { L } = api;
    api.participants.clearLayers();
    participants.forEach((coordinate, i) => {
      const person = people[i];
      const slot = person?.slot ?? i;
      const n = personColourIndex(slot);
      const name = person?.name ?? `Person ${i + 1}`;
      const marker = L.marker([coordinate.lat, coordinate.lng], {
        icon: L.divIcon({
          className: "map-person",
          html: `<span class="map-person__badge map-person__badge--${personShape(slot)}" style="background:var(--person-${n});color:var(--person-${n}-on)">${escapeHtml(person?.initial ?? String(i + 1))}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        keyboard: false,
        interactive: false,
      }).addTo(api.participants);
      const el = marker.getElement();
      el?.setAttribute("role", "img");
      el?.setAttribute("aria-label", `${name}'s start`);
    });
  }, [api, participants, people]);

  // Result markers (rebuilt when results change; selection only toggles state below).
  useEffect(() => {
    if (!api) return;
    const { L } = api;
    api.results.clearLayers();
    resultMarkers.current.clear();
    results.forEach((point, index) => {
      const rank = index + 1;
      const marker = L.marker([point.coordinate.lat, point.coordinate.lng], {
        icon: L.divIcon({
          className: "map-result",
          html: `<span class="map-result__dot num">${rank}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
        keyboard: true,
        riseOnHover: true,
      }).addTo(api.results);
      const select = () => latest.current.onSelect(point);
      marker.on("click", select);
      const el = marker.getElement();
      if (el) {
        el.setAttribute("aria-label", `Meeting point ${rank}, longest trip ${formatMinutes(point.max)} min`);
        el.setAttribute("aria-pressed", "false");
        el.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            select();
          }
        });
      }
      resultMarkers.current.set(point.id, marker);
    });
  }, [api, results]);

  // Selection state on markers: harbour fill + ring, aria-pressed, on top.
  useEffect(() => {
    if (!api) return;
    for (const [id, marker] of resultMarkers.current) {
      const selected = id === selectedId;
      const el = marker.getElement();
      el?.classList.toggle("is-selected", selected);
      el?.setAttribute("aria-pressed", String(selected));
      marker.setZIndexOffset(selected ? 1000 : 0);
    }
  }, [api, results, selectedId]);

  // Fit everyone and every result when a new set arrives (or start points alone while loading).
  useEffect(() => {
    if (!api) return;
    fit([...participants, ...results.map((r) => r.coordinate)]);
  }, [api, participants, results]);

  // Centre the selected point in the visible part of the map.
  useEffect(() => {
    if (!api || !selectedId) return;
    const point = latest.current.results.find((r) => r.id === selectedId);
    if (!point) return;
    const { map, L } = api;
    const zoom = Math.max(map.getZoom(), 10);
    const projected = map.project(L.latLng(point.coordinate.lat, point.coordinate.lng), zoom);
    const centre = map.unproject(projected.add([0, latest.current.bottomInset / 2]), zoom);
    if (prefersReducedMotion()) map.setView(centre, zoom, { animate: false });
    else map.flyTo(centre, zoom, { duration: 0.6 });
  }, [api, selectedId]);

  // Isochrone polygon, then fit to it.
  useEffect(() => {
    if (!api) return;
    api.isochrone.clearLayers();
    if (!isochrone) return;
    api.L.geoJSON(isochrone as GeoJSON.GeoJsonObject, {
      interactive: false,
      style: { className: "map-isochrone", color: "#0b6a73", weight: 2, fillOpacity: 0.15 },
    }).addTo(api.isochrone);
    fit(geometryCoordinates(isochrone));
  }, [api, isochrone]);

  // Debug: every evaluated candidate (anchors filled, grid hollow).
  useEffect(() => {
    if (!api) return;
    api.debug.clearLayers();
    for (const c of debugCandidates ?? []) {
      api.L.circleMarker([c.coordinate.lat, c.coordinate.lng], {
        radius: c.kind === "ANCHOR" ? 4 : 3,
        interactive: false,
        className: `map-debug map-debug--${c.kind.toLowerCase()}`,
        color: "#4a5e6b",
        weight: 1,
        fillOpacity: c.kind === "ANCHOR" ? 0.8 : 0,
      }).addTo(api.debug);
    }
  }, [api, debugCandidates]);

  return (
    <div className="meeting-map" data-ready={api ? "" : undefined}>
      <div ref={containerRef} className="meeting-map__canvas" />
      {failed ? (
        <p className="meeting-map__error">The map couldn't load. The list has every result.</p>
      ) : null}
    </div>
  );
}
