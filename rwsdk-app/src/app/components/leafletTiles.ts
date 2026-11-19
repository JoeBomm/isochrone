import type * as Leaflet from "leaflet";

/**
 * L.TileLayer that never writes a `data:` URL.
 *
 * Leaflet 1.9 cancels a tile request (tile removed, or zoom changed while it
 * loads) by setting the <img> src to an inline `data:image/gif` placeholder.
 * The app's CSP allows images only from 'self' and the tile host, so every
 * cancel would be blocked and reported as a violation. Allowing `data:` in
 * img-src would loosen the policy, so instead these two methods (copied from
 * leaflet 1.9.4 TileLayer) clear the src attribute, which also aborts the
 * request (HTML "update the image data"). Pinned to leaflet ^1.9.4; re-check
 * on a Leaflet upgrade (leafletTiles.test.tsx covers both paths).
 *
 * Takes the Leaflet namespace as an argument because Leaflet itself is loaded
 * lazily on the client (MeetingMap).
 */
export function cspSafeTileLayer(L: typeof Leaflet): typeof Leaflet.TileLayer {
  type Tile = { el: HTMLImageElement; coords: Leaflet.Coords };
  type Internals = { _tiles: Record<string, Tile>; _tileZoom: number; fire: Leaflet.Evented["fire"] };
  const gridRemoveTile = (L.GridLayer.prototype as unknown as { _removeTile(key: string): void })._removeTile;

  return L.TileLayer.extend({
    _abortLoading(this: Internals) {
      for (const key in this._tiles) {
        const { el: tile, coords } = this._tiles[key];
        if (coords.z === this._tileZoom) continue;
        tile.onload = null;
        tile.onerror = null;
        if (!tile.complete) {
          tile.removeAttribute("src");
          L.DomUtil.remove(tile);
          delete this._tiles[key];
          this.fire("tileabort", { tile, coords });
        }
      }
    },

    _removeTile(this: Internals, key: string) {
      const tile = this._tiles[key];
      if (!tile) return;
      tile.el.removeAttribute("src");
      return gridRemoveTile.call(this, key);
    },
  }) as unknown as typeof Leaflet.TileLayer;
}
