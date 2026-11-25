import { isDebugHost } from "./debugHost.js";

const PRODUCTION_API_ORIGIN = "https://api1.routevn.com";
// Development builds call a locally running API.
const LOCAL_API_ORIGIN = "http://127.0.0.1:3100";

// A page from a dev server (a local or private host, on a port) is a
// development build whatever its bundle mode, so it never reaches the
// production API. Release apps load from their own scheme or a domain.
const isDevServerPage = (page) =>
  (page?.protocol === "http:" || page?.protocol === "https:") &&
  page.port !== "" &&
  isDebugHost(page.hostname);

// The URL of one RouteVN API RPC endpoint, such as `/asset-store/rpc`. A
// development build calls the local API, or `override` when it is set; a
// release build always calls production and ignores `override`.
export const resolveRouteVnRpcUrl = ({
  path,
  debug = false,
  page,
  override,
} = {}) => {
  const development = debug || isDevServerPage(page);
  const url = new URL(
    development
      ? (override ?? `${LOCAL_API_ORIGIN}${path}`)
      : `${PRODUCTION_API_ORIGIN}${path}`,
  );
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Invalid RouteVN API endpoint for ${path}.`);
  }
  return url.href;
};
