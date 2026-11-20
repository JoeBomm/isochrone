import type { RequestInfo } from "rwsdk/worker";
import { isDebugSearch } from "@/app/components/results";
import { HomePage } from "./HomePage";

/**
 * `/`: server entry for the client HomePage. The `?debug=1` flag is read
 * here from the request URL and passed down, so the server render and the
 * client hydrate with the same value.
 */
export const Home = ({ request }: RequestInfo) => (
  <HomePage debug={isDebugSearch(new URL(request.url).search)} />
);
