import * as Leaflet from "leaflet";
import { describe, expect, it } from "vitest";
import { cspSafeTileLayer } from "./leafletTiles";

// Real Leaflet (happy-dom has a window). Stock Leaflet 1.9 cancels a tile by
// setting its src to an inline data: GIF, which the app's CSP (img-src 'self'
// + the tile host) blocks and reports. The subclass clears src instead.
const L = ((Leaflet as unknown as { default?: typeof Leaflet }).default ?? Leaflet) as typeof Leaflet;

/** The internals the override replaces (protected in @types/leaflet). */
type Exposed = {
  _tiles: Record<string, { el: HTMLImageElement; coords: { x: number; y: number; z: number } }>;
  _tileZoom: number;
  _removeTile(key: string): void;
  _abortLoading(): void;
  on: Leaflet.TileLayer["on"];
};

function layerWithTile(complete: boolean) {
  const Layer = cspSafeTileLayer(L);
  const layer = new Layer("https://tiles.example/{z}/{x}/{y}.png") as unknown as Exposed;
  const el = document.createElement("img");
  el.setAttribute("src", "https://tiles.example/1/0/0.png");
  Object.defineProperty(el, "complete", { value: complete });
  const parent = document.createElement("div");
  parent.appendChild(el);
  layer._tiles = { "0:0:1": { el, coords: { x: 0, y: 0, z: 1 } } };
  layer._tileZoom = 2;
  return { layer, el, parent };
}

describe("cspSafeTileLayer", () => {
  it("removing a tile clears its src without a data: URL", () => {
    const { layer, el, parent } = layerWithTile(true);
    layer._removeTile("0:0:1");
    expect(el.hasAttribute("src")).toBe(false);
    expect(parent.contains(el)).toBe(false);
    expect(layer._tiles["0:0:1"]).toBeUndefined();
  });

  it("aborting a loading tile from an old zoom clears its src without a data: URL", () => {
    const { layer, el, parent } = layerWithTile(false);
    const aborted: unknown[] = [];
    layer.on("tileabort", (e) => aborted.push(e));
    layer._abortLoading();
    expect(el.hasAttribute("src")).toBe(false);
    expect(parent.contains(el)).toBe(false);
    expect(layer._tiles["0:0:1"]).toBeUndefined();
    expect(aborted).toHaveLength(1);
  });

  it("leaves finished tiles from an old zoom alone (stock behaviour)", () => {
    const { layer, el } = layerWithTile(true);
    layer._abortLoading();
    expect(el.getAttribute("src")).toBe("https://tiles.example/1/0/0.png");
    expect(layer._tiles["0:0:1"]).toBeDefined();
  });

  it("stock Leaflet would have used a data: URL (guards the reason for the override)", () => {
    const layer = new L.TileLayer("https://tiles.example/{z}/{x}/{y}.png") as unknown as Exposed;
    const el = document.createElement("img");
    layer._tiles = { k: { el, coords: { x: 0, y: 0, z: 1 } } };
    layer._removeTile("k");
    expect(el.getAttribute("src")).toMatch(/^data:/);
  });
});
