import type { RequestInfo } from "rwsdk/worker";
import { isDebugSearch } from "@/app/components/results";
import { approximateLocation } from "@/server/cfLocation";
import { HomePage } from "./HomePage";

/**
 * `/`: server entry for the client HomePage. The `?debug=1` flag is read
 * here from the request URL and passed down, so the server render and the
 * client hydrate with the same value. The map's starting view is the
 * visitor's approximate IP location from Cloudflare (`request.cf`, rounded to
 * ~11 km), or the world view when there is none.
 */
export const Home = ({ request }: RequestInfo) => (
  <HomePage
    debug={isDebugSearch(new URL(request.url).search)}
    initialCenter={approximateLocation(request.cf)}
  />
);
