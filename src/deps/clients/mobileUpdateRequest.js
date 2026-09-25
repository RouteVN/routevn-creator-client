const MOBILE_UPDATE_PATH = "/system/updates/v1/routevn-creator/mobile";
const LOCAL_UPDATE_URL = `http://127.0.0.1:8787${MOBILE_UPDATE_PATH}`;
const PRODUCTION_UPDATE_URL = `https://api1.routevn.com${MOBILE_UPDATE_PATH}`;
const MAX_RESPONSE_BYTES = 64 * 1024;

const isDebugHost = (hostname) => {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local"))
    return true;
  if (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd")))
    return true;
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
    url.pathname !== MOBILE_UPDATE_PATH ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid client update endpoint.");
  return url.href;
};

const readBoundedBody = async (response) => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Update response stream is unavailable.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new Error("Update response is too large.");
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
};

export const createMobileUpdateRequest = ({
  debug,
  override,
  fetchImpl,
} = {}) => {
  return async (body) => {
    const url = resolveMobileUpdateUrl({ debug, override });
    if (
      typeof body !== "string" ||
      new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES
    )
      throw new Error("Invalid update request body.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await (fetchImpl ?? globalThis.fetch)(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RouteVN-RPC": "1",
        },
        body,
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      const contentLength = Number(response.headers.get("Content-Length"));
      if (contentLength > MAX_RESPONSE_BYTES)
        throw new Error("Update response is too large.");
      return {
        status: response.status,
        body: await readBoundedBody(response),
        retryAfter: response.headers.get("Retry-After") ?? undefined,
      };
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  };
};
