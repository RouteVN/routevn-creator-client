const DEFAULT_LIMITS = Object.freeze({
  manifestBytes: 2 * 1024 * 1024,
  fileBytes: 50 * 1024 * 1024,
  totalBytes: 200 * 1024 * 1024,
  manifestTimeoutMs: 15_000,
  fileTimeoutMs: 30_000,
  downloadConcurrency: 3,
});

const JSON_CONTENT_TYPES = Object.freeze([
  "application/json",
  "application/importmap+json",
  "text/json",
  "text/plain",
]);

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class ImportPackageClientError extends Error {
  constructor(code, message, { retryable = false, details } = {}) {
    super(message);
    this.name = "ImportPackageClientError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

const createClientError = (code, message, options) =>
  new ImportPackageClientError(code, message, options);

const isAbortError = (error) => error?.name === "AbortError";

const isAllowedUrl = (url) => {
  if (url.protocol === "https:") {
    return true;
  }

  return url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname);
};

export const resolveImportUrl = (value, baseUrl) => {
  let url;
  try {
    url = baseUrl ? new URL(value, baseUrl) : new URL(value);
  } catch {
    throw createClientError("invalid_url", "Enter a valid import URL.");
  }

  if (!isAllowedUrl(url)) {
    throw createClientError(
      "unsupported_protocol",
      "Import links must use HTTPS. HTTP is allowed only for localhost testing.",
    );
  }

  return url;
};

const createTimedSignal = ({ signal, timeoutMs }) => {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromSource = () => controller.abort(signal?.reason);

  if (signal?.aborted) {
    abortFromSource();
  } else {
    signal?.addEventListener("abort", abortFromSource, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose() {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromSource);
    },
  };
};

const mapResponseError = (response, kind) => {
  if (response.status === 401 || response.status === 403) {
    return createClientError(
      "authorization_required",
      "This package requires authorization.",
    );
  }
  if (response.status === 404) {
    return createClientError(
      kind === "manifest" ? "manifest_not_found" : "file_not_found",
      kind === "manifest"
        ? "The import package was not found."
        : "A package file was not found.",
    );
  }
  if (response.status >= 500) {
    return createClientError(
      kind === "manifest" ? "manifest_server_error" : "file_server_error",
      kind === "manifest"
        ? "The package server could not load this package."
        : "The package server could not load a file.",
      { retryable: true },
    );
  }

  return createClientError(
    kind === "manifest" ? "manifest_request_failed" : "file_request_failed",
    kind === "manifest"
      ? "Package could not be loaded."
      : "A package file could not be downloaded.",
    { retryable: response.status === 408 || response.status === 429 },
  );
};

const parseContentLength = (response) => {
  const rawValue = response.headers?.get?.("content-length");
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return undefined;
  }
  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

const readBoundedBytes = async ({ response, maxBytes, signal, limitCode }) => {
  const declaredLength = parseContentLength(response);
  if (declaredLength !== undefined && declaredLength > maxBytes) {
    throw createClientError(limitCode, "Import data exceeds the allowed size.");
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw createClientError(
        limitCode,
        "Import data exceeds the allowed size.",
      );
    }
    return bytes;
  }

  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw createClientError(
          limitCode,
          "Import data exceeds the allowed size.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const request = async ({
  fetchImpl,
  url,
  kind,
  signal,
  timeoutMs,
  headers,
}) => {
  const timed = createTimedSignal({ signal, timeoutMs });
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers,
      signal: timed.signal,
    });
    if (!response.ok) {
      throw mapResponseError(response, kind);
    }
    return {
      response,
      signal: timed.signal,
      didTimeOut: timed.didTimeOut,
      dispose: timed.dispose,
    };
  } catch (error) {
    timed.dispose();
    if (error instanceof ImportPackageClientError) {
      throw error;
    }
    if (isAbortError(error)) {
      if (timed.didTimeOut()) {
        throw createClientError(
          kind === "manifest" ? "manifest_timeout" : "file_timeout",
          kind === "manifest"
            ? "The package request timed out."
            : "A package file request timed out.",
          { retryable: true },
        );
      }
      throw createClientError("cancelled", "Import cancelled.");
    }
    throw createClientError(
      kind === "manifest" ? "manifest_network_error" : "file_network_error",
      kind === "manifest"
        ? "Package could not be loaded."
        : "A package file could not be downloaded.",
      { retryable: true },
    );
  }
};

const mapBodyReadError = (error, requestResult, kind) => {
  if (!isAbortError(error)) return error;
  if (requestResult.didTimeOut()) {
    return createClientError(
      kind === "manifest" ? "manifest_timeout" : "file_timeout",
      kind === "manifest"
        ? "The package request timed out."
        : "A package file request timed out.",
      { retryable: true },
    );
  }
  return createClientError("cancelled", "Import cancelled.");
};

const bufferToHex = (buffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

const normalizeSha256 = (value) =>
  `${value ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/^sha256[:-]/, "");

const verifySha256 = async ({ bytes, expectedSha256, cryptoImpl }) => {
  if (!expectedSha256) return;
  if (!cryptoImpl?.subtle?.digest) {
    throw createClientError(
      "integrity_unavailable",
      "File integrity validation is unavailable.",
    );
  }

  const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
  if (bufferToHex(digest) !== normalizeSha256(expectedSha256)) {
    throw createClientError(
      "integrity_mismatch",
      "A package file failed integrity validation.",
    );
  }
};

const getJsonContentType = (response) =>
  (response.headers?.get?.("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

const isJsonContentType = (contentType) =>
  JSON_CONTENT_TYPES.includes(contentType) || contentType.endsWith("+json");

export const createImportPackageClient = ({
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  limits = {},
} = {}) => {
  const resolvedLimits = { ...DEFAULT_LIMITS, ...limits };

  return {
    limits: resolvedLimits,

    async fetchManifest({ url, signal } = {}) {
      const requestUrl = resolveImportUrl(url);
      const requestResult = await request({
        fetchImpl,
        url: requestUrl,
        kind: "manifest",
        signal,
        timeoutMs: resolvedLimits.manifestTimeoutMs,
        headers: { Accept: "application/json" },
      });
      try {
        const { response } = requestResult;
        const finalUrl = resolveImportUrl(response.url || requestUrl.href);
        const contentType = getJsonContentType(response);
        if (!contentType || !isJsonContentType(contentType)) {
          throw createClientError(
            "manifest_content_type",
            "Import URL must return JSON.",
          );
        }

        const bytes = await readBoundedBytes({
          response,
          maxBytes: resolvedLimits.manifestBytes,
          signal: requestResult.signal,
          limitCode: "manifest_too_large",
        });

        let manifest;
        try {
          manifest = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw createClientError(
            "manifest_invalid_json",
            "Import URL did not return valid JSON.",
          );
        }

        return {
          manifest,
          manifestUrl: finalUrl.href,
          byteLength: bytes.byteLength,
        };
      } catch (error) {
        throw mapBodyReadError(error, requestResult, "manifest");
      } finally {
        requestResult.dispose();
      }
    },

    async downloadFile({ descriptor, manifestUrl, signal } = {}) {
      const sourceUrl = descriptor?.source?.url ?? descriptor?.url;
      const url = resolveImportUrl(sourceUrl, manifestUrl);
      if (
        Number.isFinite(descriptor?.size) &&
        descriptor.size > resolvedLimits.fileBytes
      ) {
        throw createClientError(
          "file_too_large",
          "A package file exceeds the allowed size.",
        );
      }

      const requestResult = await request({
        fetchImpl,
        url,
        kind: "file",
        signal,
        timeoutMs: resolvedLimits.fileTimeoutMs,
        headers: { Accept: descriptor?.mimeType ?? "*/*" },
      });
      try {
        const { response } = requestResult;
        const finalUrl = resolveImportUrl(response.url || url.href);
        const responseContentType = getJsonContentType(response);
        if (
          descriptor?.mimeType &&
          responseContentType &&
          responseContentType !== "application/octet-stream" &&
          responseContentType !== descriptor.mimeType.toLowerCase()
        ) {
          throw createClientError(
            "file_content_type_mismatch",
            "A package file has an unexpected content type.",
          );
        }
        const bytes = await readBoundedBytes({
          response,
          maxBytes: resolvedLimits.fileBytes,
          signal: requestResult.signal,
          limitCode: "file_too_large",
        });
        await verifySha256({
          bytes,
          expectedSha256: descriptor?.sha256,
          cryptoImpl,
        });

        return {
          bytes,
          byteLength: bytes.byteLength,
          contentType:
            responseContentType ||
            descriptor?.mimeType ||
            "application/octet-stream",
          resolvedUrl: finalUrl.href,
        };
      } catch (error) {
        throw mapBodyReadError(error, requestResult, "file");
      } finally {
        requestResult.dispose();
      }
    },
  };
};

export const IMPORT_PACKAGE_CLIENT_LIMITS = DEFAULT_LIMITS;
