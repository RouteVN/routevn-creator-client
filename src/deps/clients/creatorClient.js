import { resolveRouteVnRpcUrl } from "../../internal/routevnApiUrl.js";

const CREATOR_RPC_PATH = "/creator/rpc";
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUIRED_HEADERS = 16;

// A creator call that failed. `code` is the API's error code, such as
// `DEBUG_CODE_UNUSABLE`, and `details` its details. Two codes come from the
// client: `RATE_LIMITED` when the endpoint refused the call because this
// network made too many (`details.retryAfterMs` when the server says how
// long to wait), and `UNAVAILABLE` for no connection, a server error or an
// answer the client does not understand.
export class CreatorRequestError extends Error {
  constructor(code, message, { details, cause } = {}) {
    super(message, { cause });
    this.name = "CreatorRequestError";
    this.code = code;
    this.details = details ?? {};
  }
}

const unavailable = (cause) =>
  new CreatorRequestError(
    "UNAVAILABLE",
    "The RouteVN service could not be reached.",
    { cause },
  );

export const resolveCreatorRpcUrl = (options = {}) =>
  resolveRouteVnRpcUrl({ ...options, path: CREATOR_RPC_PATH });

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isText = (value) => typeof value === "string" && value.length > 0;

const isTimestamp = (value) => Number.isSafeInteger(value) && value > 0;

const isWebUrl = (value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

const readRequiredHeaders = (headers) => {
  if (!Array.isArray(headers) || headers.length > MAX_REQUIRED_HEADERS) {
    return undefined;
  }
  if (
    !headers.every((header) => isText(header?.name) && isText(header.value))
  ) {
    return undefined;
  }
  return headers.map(({ name, value }) => ({ name, value }));
};

// Seconds in a `Retry-After` header, as milliseconds; undefined when the
// header is missing or not a number of seconds.
const readRetryAfterMs = (response) => {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds * 1000)
    : undefined;
};

// Anonymous calls from Creator to the RouteVN API: sending a project to
// support with a code support gave the user. No account or credentials are
// involved; the code is the only grant.
export const createCreatorClient = ({
  url = resolveCreatorRpcUrl({
    debug: import.meta.env?.DEV === true,
    page: globalThis.location,
    override: import.meta.env?.VITE_ROUTEVN_CREATOR_RPC_URL,
  }),
  fetchImpl = globalThis.fetch,
} = {}) => {
  const call = async (method, params) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let text;
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RouteVN-RPC": "1",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 429) {
        const details = {};
        const retryAfterMs = readRetryAfterMs(response);
        if (retryAfterMs !== undefined) details.retryAfterMs = retryAfterMs;
        throw new CreatorRequestError(
          "RATE_LIMITED",
          `${method} was refused: too many requests.`,
          { details },
        );
      }
      if (!response.ok) {
        throw new Error(`${method} failed with HTTP ${response.status}.`);
      }
      if (Number(response.headers.get("Content-Length")) > MAX_RESPONSE_BYTES) {
        throw new Error(`${method} response is too large.`);
      }
      text = await response.text();
    } catch (error) {
      if (error instanceof CreatorRequestError) throw error;
      throw unavailable(error);
    } finally {
      clearTimeout(timeout);
    }
    if (text.length > MAX_RESPONSE_BYTES) {
      throw unavailable(new Error(`${method} response is too large.`));
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw unavailable(error);
    }
    const code = body?.error?.data?.code;
    if (isText(code)) {
      const details = body.error.data.details;
      throw new CreatorRequestError(code, `${method} failed with ${code}.`, {
        details: isObject(details) ? details : {},
      });
    }
    if (!isObject(body) || !isObject(body.result)) {
      throw unavailable(new Error(`${method} failed.`));
    }
    return body.result;
  };

  return {
    // A signed link that stores one file of `sizeBytes` bytes with this
    // SHA-256 for support: the file is sent to `uploadUrl` with exactly
    // `requiredHeaders`, then completed before `completeBefore`. `device`
    // carries what the app knows of this device, for support to read.
    async prepareDebugUpload({ code, sizeBytes, sha256, device }) {
      const params = { code, data: { sizeBytes, sha256 } };
      if (device !== undefined) params.device = device;
      const result = await call("creator.prepareDebugUpload", params);
      const requiredHeaders = readRequiredHeaders(result.requiredHeaders);
      if (
        !isWebUrl(result.uploadUrl) ||
        !requiredHeaders ||
        !isTimestamp(result.expiresAt) ||
        !isTimestamp(result.completeBefore)
      ) {
        throw unavailable(new Error("Invalid upload link."));
      }
      return {
        uploadUrl: result.uploadUrl,
        requiredHeaders,
        expiresAt: result.expiresAt,
        completeBefore: result.completeBefore,
      };
    },

    // Tells support the file is in place. The code is used up, and the file
    // is deleted at `deleteAfter`, or sooner when support deletes it.
    async completeDebugUpload({ code, sha256 }) {
      const result = await call("creator.completeDebugUpload", {
        code,
        sha256,
      });
      if (!isTimestamp(result.deleteAfter)) {
        throw unavailable(new Error("Invalid upload completion."));
      }
      return { deleteAfter: result.deleteAfter };
    },
  };
};
