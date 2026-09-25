const LOCAL_UPDATE_URL = "http://127.0.0.1:8787/system/rpc";
const PRODUCTION_UPDATE_URL = "https://api1.routevn.com/system/rpc";

const isDebugHost = (hostname) => {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local"))
    return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  const parts = host.split(".");
  if (parts.some((part) => !/^(?:0|[1-9][0-9]{0,2})$/.test(part))) return false;
  const octets = parts.map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  )
    return false;
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
};

export const resolveMobileUpdateUrl = ({ debug = false, override } = {}) => {
  let value = PRODUCTION_UPDATE_URL;
  if (debug) value = override ?? LOCAL_UPDATE_URL;
  const url = new URL(value);
  const localDebugUrl =
    debug &&
    url.protocol === "http:" &&
    url.port !== "" &&
    isDebugHost(url.hostname);
  if (
    (url.href !== PRODUCTION_UPDATE_URL && !localDebugUrl) ||
    url.username ||
    url.password ||
    url.pathname !== "/system/rpc" ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid client update endpoint.");
  return url.href;
};

export const createMobileUpdateRequest = ({ bridge, debug, override }) => {
  return (body) =>
    bridge("httpRequest", {
      url: resolveMobileUpdateUrl({ debug, override }),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RouteVN-RPC": "1",
      },
      body,
    });
};
