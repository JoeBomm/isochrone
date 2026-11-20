import { RouteMiddleware } from "rwsdk/router";

/** The only third-party image host: OpenStreetMap standard tiles (see MeetingMap.tsx). */
export const TILE_ORIGIN = "https://tile.openstreetmap.org";

export const setCommonHeaders =
  (): RouteMiddleware =>
  ({ response, rw: { nonce } }) => {
    if (!import.meta.env.VITE_IS_DEV_SERVER) {
      // Forces browsers to always use HTTPS for a specified time period (2 years)
      response.headers.set(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
      );
    }

    // Forces browser to use the declared content-type instead of trying to guess/sniff it
    response.headers.set("X-Content-Type-Options", "nosniff");

    // Stops browsers from sending the referring webpage URL in HTTP headers
    response.headers.set("Referrer-Policy", "no-referrer");

    // Explicitly disables access to specific browser features/APIs
    response.headers.set(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()",
    );

    // Defines trusted sources for content loading and script execution.
    // Fonts are self-hosted (@fontsource-variable, bundled to /assets), so the
    // starter's Google Fonts hosts are removed from style-src and font-src.
    // img-src adds exactly one host: the OpenStreetMap tile server used by
    // MeetingMap (TILE_URL). Leaflet's CSS is bundled and markers are HTML
    // (divIcon), so no other image source is needed.
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'unsafe-eval' 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' ${TILE_ORIGIN}; frame-ancestors 'self'; frame-src 'self' https://challenges.cloudflare.com; object-src 'none';`,
    );
  };
