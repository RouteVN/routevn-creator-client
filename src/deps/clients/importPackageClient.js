import { ImportPackageClientError } from "./importPackageErrors.js";
import {
  findZipDirectory,
  openRemoteZip,
  ZIP_END_SEARCH_BYTES,
} from "./remoteZip.js";

export { ImportPackageClientError };

const DEFAULT_LIMITS = Object.freeze({
  manifestBytes: 2 * 1024 * 1024,
  directoryBytes: 4 * 1024 * 1024,
  fileBytes: 50 * 1024 * 1024,
  totalBytes: 200 * 1024 * 1024,
  manifestTimeoutMs: 15_000,
  fileTimeoutMs: 30_000,
  // A package ZIP downloaded whole, from a server without byte ranges.
  packageTimeoutMs: 5 * 60_000,
  downloadConcurrency: 3,
});

const JSON_CONTENT_TYPES = Object.freeze([
  "application/json",
  "application/importmap+json",
  "text/json",
  "text/plain",
]);

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

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

  const startTimer = (ms) =>
    setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
  let timeoutId = startTimer(timeoutMs);

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    // Starts the time limit again, at `ms` from now.
    restart(ms) {
      clearTimeout(timeoutId);
      timeoutId = startTimer(ms);
    },
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
  cache = "no-store",
}) => {
  const timed = createTimedSignal({ signal, timeoutMs });
  try {
    const response = await fetchImpl(url, {
      cache,
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
      restartTimeout: timed.restart,
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

const invalidPackage = () =>
  createClientError("package_invalid", "The asset package could not be read.");

const packageChanged = () =>
  createClientError(
    "package_changed",
    "This pack has changed since it was opened. Open it again.",
  );

// A signed package URL is used as if it lasts at least this long and at most
// this long, whatever this device's clock says of its `expiresAt`, and is
// replaced this long before then.
const SIGNED_URL_MIN_LIFETIME_MS = 60_000;
const SIGNED_URL_MAX_LIFETIME_MS = 10 * 60_000;
const SIGNED_URL_RENEW_EARLY_MS = 30_000;

// A signed package ZIP from `getZip()`. A failure keeps its code, such as
// the asset store's, so the importer can say what went wrong.
const requestZip = async (getZip) => {
  try {
    return await getZip();
  } catch (error) {
    throw createClientError(
      error?.code ?? "package_unavailable",
      "The asset package could not be loaded.",
      { retryable: true, cause: error },
    );
  }
};

// Whether two parsed JSON values are the same, whatever their keys' order.
const isSameJson = (left, right) => {
  if (left === right) return true;
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => isSameJson(value, right[index]))
    );
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(right)
  ) {
    return false;
  }
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && isSameJson(left[key], right[key]),
    )
  );
};

const cancelled = () => createClientError("cancelled", "Import cancelled.");

// A ZIP's first bytes: the signature of its first entry's local header.
const ZIP_START = Object.freeze([0x50, 0x4b, 0x03, 0x04]);

const startsLikeZip = (bytes) =>
  bytes.byteLength >= ZIP_START.length &&
  ZIP_START.every((byte, index) => bytes[index] === byte);

// The whole size of what a response is a part of or all of: the total its
// `Content-Range` names, or the length of a body that starts at byte 0. A
// cross-origin response shows `Content-Range` only when its server exposes
// it, so the length is what usually answers.
const parseTotalSize = (response) => {
  const match = /^bytes\s+0-\d+\/(\d+)$/i.exec(
    (response.headers?.get?.("content-range") ?? "").trim(),
  );
  const total = match ? Number(match[1]) : parseContentLength(response);
  return Number.isSafeInteger(total) ? total : undefined;
};

// A response body read a part at a time: its first bytes to tell what it is,
// then all of it or none.
const createBodyReader = ({ response, signal }) => {
  const reader = response.body?.getReader?.();
  const chunks = [];
  let byteLength = 0;
  let done = false;
  const pull = async () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!reader) {
      chunks.push(new Uint8Array(await response.arrayBuffer()));
      byteLength = chunks[0].byteLength;
      done = true;
      return;
    }
    const result = await reader.read();
    if (result.done) {
      done = true;
      return;
    }
    chunks.push(result.value);
    byteLength += result.value.byteLength;
  };
  const join = () => {
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  };
  const cancel = async () => {
    try {
      await reader?.cancel();
    } catch {
      // The body is being dropped; how it ends does not matter.
    }
  };

  return {
    cancel,
    async readStart(length) {
      while (!done && byteLength < length) await pull();
      return join().subarray(0, length);
    },
    async readAll({ maxBytes, limitCode }) {
      while (!done && byteLength <= maxBytes) await pull();
      if (byteLength > maxBytes) {
        await cancel();
        throw createClientError(
          limitCode,
          "Import data exceeds the allowed size.",
        );
      }
      return join();
    },
  };
};

// A package ZIP's bytes wherever they are: `size`, and `read(start, end)` for
// the bytes `start` through `end`, inclusive. This one is held in memory.
const createMemoryReader = (bytes) => ({
  size: bytes.byteLength,
  async read(start, end, { signal } = {}) {
    if (signal?.aborted) throw cancelled();
    return bytes.subarray(start, end + 1);
  },
});

// A ZIP file on this device, read a slice at a time without any request.
const createBlobReader = (blob) => ({
  size: blob.size,
  async read(start, end, { signal } = {}) {
    if (signal?.aborted) throw cancelled();
    let bytes;
    try {
      bytes = new Uint8Array(await blob.slice(start, end + 1).arrayBuffer());
    } catch {
      throw invalidPackage();
    }
    if (signal?.aborted) throw cancelled();
    return bytes;
  },
});

// A local package has no address. Its plan still names where it came from,
// with a URL that nothing can fetch.
const localPackageUrl = (file) =>
  `local-file:///${encodeURIComponent(file.name ?? "asset-package.zip")}`;

export const createImportPackageClient = ({
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  limits = {},
} = {}) => {
  const resolvedLimits = { ...DEFAULT_LIMITS, ...limits };

  // Exactly the bytes `start` through `end` of `url`, inclusive. The range
  // names both ends, so a cross-origin read needs no CORS preflight.
  const readRange = async ({ url, start, end, kind, signal }) => {
    const requestResult = await request({
      fetchImpl,
      url,
      kind,
      signal,
      timeoutMs:
        kind === "manifest"
          ? resolvedLimits.manifestTimeoutMs
          : resolvedLimits.fileTimeoutMs,
      headers: { Range: `bytes=${start}-${end}` },
      cache: "default",
    });
    try {
      const { response } = requestResult;
      if (response.status !== 206) {
        throw createClientError(
          "range_unsupported",
          "The package server does not serve byte ranges.",
        );
      }
      const length = end - start + 1;
      const bytes = await readBoundedBytes({
        response,
        maxBytes: length,
        signal: requestResult.signal,
        limitCode: "package_invalid",
      });
      if (bytes.byteLength !== length) {
        throw createClientError(
          "package_invalid",
          "The asset package could not be read.",
        );
      }
      return bytes;
    } catch (error) {
      throw mapBodyReadError(error, requestResult, kind);
    } finally {
      requestResult.dispose();
    }
  };

  // A ZIP on a server that serves byte ranges, `size` bytes long.
  const createRangeReader = ({ url, size }) => ({
    size,
    read: (start, end, { signal, kind } = {}) =>
      readRange({ url, start, end, kind, signal }),
  });

  // Finds out what a link leads to, and how to read it if it is a ZIP, with
  // one request for everything from byte 0 (`Range: bytes=0-`, which needs
  // no CORS preflight). The body's first bytes tell a ZIP from anything else,
  // whatever the link's path or content type say. For a ZIP:
  //
  // - a 206 answer whose size is known means the server serves ranges: the
  //   rest of the body is dropped and the ZIP is read in place, a range at a
  //   time, as a published package is;
  // - any other answer (a 200 from a server that ignores ranges, or a 206 of
  //   unknown size) is the whole ZIP, so the same body is read to its end,
  //   within the total download limit, and its entries are read from memory.
  //
  // Anything else is left to its caller, with the body dropped.
  const probePackage = async ({ url, signal }) => {
    const requestResult = await request({
      fetchImpl,
      url,
      kind: "manifest",
      signal,
      timeoutMs: resolvedLimits.manifestTimeoutMs,
      headers: { Range: "bytes=0-" },
    });
    try {
      const { response } = requestResult;
      resolveImportUrl(response.url || url.href);
      const body = createBodyReader({
        response,
        signal: requestResult.signal,
      });
      if (!startsLikeZip(await body.readStart(ZIP_START.length))) {
        await body.cancel();
        return { isZip: false };
      }
      const size = parseTotalSize(response);
      if (response.status === 206 && size !== undefined) {
        await body.cancel();
        return { isZip: true, reader: createRangeReader({ url, size }) };
      }
      if (size !== undefined && size > resolvedLimits.totalBytes) {
        await body.cancel();
        throw createClientError(
          "download_too_large",
          "The package exceeds the total download limit.",
        );
      }
      requestResult.restartTimeout(resolvedLimits.packageTimeoutMs);
      const bytes = await body.readAll({
        maxBytes: resolvedLimits.totalBytes,
        limitCode: "download_too_large",
      });
      return { isZip: true, reader: createMemoryReader(bytes) };
    } catch (error) {
      throw mapBodyReadError(error, requestResult, "manifest");
    } finally {
      requestResult.dispose();
    }
  };

  // Where a ZIP's central directory is, from the end record in its last
  // bytes. Those bytes are kept: they usually hold the directory too, and
  // all of a small package, which are then read without another request.
  const locateZipDirectory = async ({ reader, signal }) => {
    const length = Math.min(reader.size, ZIP_END_SEARCH_BYTES);
    if (length === 0) throw invalidPackage();
    const tailStart = reader.size - length;
    const tail = await reader.read(tailStart, reader.size - 1, {
      signal,
      kind: "manifest",
    });
    if (tail.byteLength !== length) throw invalidPackage();
    return {
      ...findZipDirectory(tail, { size: reader.size }),
      reader: {
        size: reader.size,
        async read(start, end, options) {
          if (start < tailStart) return reader.read(start, end, options);
          if (options?.signal?.aborted) throw cancelled();
          return tail.subarray(start - tailStart, end - tailStart + 1);
        },
      },
    };
  };

  // A package at a link that is opened to find out what it is: a ZIP, or,
  // with `allowManifest`, a manifest whose files resolve against it.
  const createLinkedPackageSource = ({ url, allowManifest }) => {
    let source;
    return {
      async readManifest({ signal } = {}) {
        const probed = await probePackage({ url, signal });
        if (probed.isZip) {
          source = createZipPackageSource({
            client,
            cryptoImpl,
            manifestUrl: url.href,
            locate: (options) =>
              locateZipDirectory({ reader: probed.reader, ...options }),
          });
          return source.readManifest({ signal });
        }
        if (!allowManifest) throw invalidPackage();
        const manifestSource = createUrlPackageSource({
          client,
          url: url.href,
        });
        let result;
        try {
          result = await manifestSource.readManifest({ signal });
        } catch (error) {
          if (
            error?.code === "manifest_content_type" ||
            error?.code === "manifest_invalid_json"
          ) {
            throw createClientError(
              "package_link_unsupported",
              "This link is not an asset package ZIP file or manifest.",
            );
          }
          throw error;
        }
        source = manifestSource;
        return result;
      },
      readFile(options) {
        if (!source) throw invalidPackage();
        return source.readFile(options);
      },
    };
  };

  // A published package: the caller knows its size and its directory's place.
  const createPublishedPackageSource = ({ zip }) => {
    const url = resolveImportUrl(zip.url);
    const { size, directoryOffset, directorySize } = zip;
    if (
      !isByteCount(size) ||
      !isByteCount(directoryOffset) ||
      !isByteCount(directorySize) ||
      directorySize === 0 ||
      directoryOffset + directorySize > size
    ) {
      throw invalidPackage();
    }
    const reader = createRangeReader({ url, size });
    return createZipPackageSource({
      client,
      cryptoImpl,
      manifestUrl: url.href,
      locate: async () => ({ reader, directoryOffset, directorySize }),
    });
  };

  // A published package ZIP at a signed URL that stops working: `getZip()`
  // gives `{url, expiresAt, size, directoryOffset, directorySize}`, and is
  // asked again for a fresh URL shortly before `expiresAt`, or when the
  // server refuses the URL. A fresh URL must name the same package.
  const createSignedRangeReader = ({ zip, getZip }) => {
    let current;
    let renewing;
    const use = (next) => {
      const lifetime = Math.min(
        Math.max(next.expiresAt - Date.now(), SIGNED_URL_MIN_LIFETIME_MS),
        SIGNED_URL_MAX_LIFETIME_MS,
      );
      current = {
        url: resolveImportUrl(next.url),
        staleAt: Date.now() + lifetime - SIGNED_URL_RENEW_EARLY_MS,
      };
    };
    const renew = () => {
      renewing ??= (async () => {
        try {
          const next = await requestZip(getZip);
          if (
            next.size !== zip.size ||
            next.directoryOffset !== zip.directoryOffset ||
            next.directorySize !== zip.directorySize
          ) {
            throw packageChanged();
          }
          use(next);
        } finally {
          renewing = undefined;
        }
      })();
      return renewing;
    };
    use(zip);
    const read = async (start, end, { signal, kind } = {}) => {
      if (Date.now() >= current.staleAt) await renew();
      try {
        return await readRange({ url: current.url, start, end, kind, signal });
      } catch (error) {
        if (error?.code !== "authorization_required") throw error;
        await renew();
        return readRange({ url: current.url, start, end, kind, signal });
      }
    };
    return { size: zip.size, read };
  };

  // An asset store pack, whose manifest and media the caller already has:
  // `manifest`, and `fileUrls`, the public URL of each media file a review
  // shows (`{ [fileId]: url }`), each fetched whole. An import reads its
  // files from its package ZIP instead: `getZip({ importing: true })` is
  // asked once when an import starts, and `getZip()` for a fresh URL (see
  // `createSignedRangeReader`). The ZIP's manifest must be the one the review
  // showed, or the pack has changed since.
  const createAssetPackSource = ({ id, manifest, fileUrls, getZip }) => {
    const manifestUrl = `asset-store:///${encodeURIComponent(id)}`;
    return {
      async readManifest() {
        return { manifest: structuredClone(manifest), manifestUrl };
      },
      async readFile({ descriptor, fileId, signal } = {}) {
        const url = fileUrls[fileId];
        if (!url) {
          throw createClientError(
            "file_not_found",
            "A package file was not found.",
          );
        }
        return client.downloadFile({
          descriptor: { ...descriptor, source: { url } },
          signal,
        });
      },
      async openImport({ signal } = {}) {
        const zip = await requestZip(() => getZip({ importing: true }));
        const reader = createSignedRangeReader({ zip, getZip });
        const source = createZipPackageSource({
          client,
          cryptoImpl,
          manifestUrl,
          locate: async () => ({
            reader,
            directoryOffset: zip.directoryOffset,
            directorySize: zip.directorySize,
          }),
        });
        const result = await source.readManifest({ signal });
        if (!isSameJson(result.manifest, manifest)) throw packageChanged();
        return source;
      },
    };
  };

  const client = {
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

    /**
     * One asset package's source: `readManifest()` first, then `readFile()`
     * for each file it lists.
     *
     * - `url` is a manifest whose files resolve against it.
     * - `zip` is a package ZIP, whose manifest and files are its entries:
     *   - `{url, size, directoryOffset, directorySize}` is a published
     *     package, read in place with byte ranges;
     *   - `{url}` is a ZIP on any server: its size and central directory are
     *     found by reading it (see `probePackage`);
     *   - `{file}` is a ZIP file on this device, a `File` or `Blob`, read
     *     without any request.
     * - `assetPack` is an asset store pack, `{id, manifest, fileUrls,
     *   getZip}`: its manifest and media come from the asset store, and an
     *   import reads its files from its signed package ZIP after
     *   `openImport()` (see `createAssetPackSource`).
     * - `link` is a URL to either a package ZIP or a manifest. Which one is
     *   decided by what the link returns, not by how it is written, as a
     *   download link often has no file extension: a body that starts as a
     *   ZIP is read as `zip: {url}`, and anything else as `url`.
     */
    openPackage({ url, zip, link, assetPack } = {}) {
      if (assetPack !== undefined) return createAssetPackSource(assetPack);
      if (link !== undefined) {
        return createLinkedPackageSource({
          url: resolveImportUrl(link),
          allowManifest: true,
        });
      }
      if (!zip) return createUrlPackageSource({ client, url });
      if (zip.file) {
        const reader = createBlobReader(zip.file);
        return createZipPackageSource({
          client,
          cryptoImpl,
          manifestUrl: localPackageUrl(zip.file),
          locate: (options) => locateZipDirectory({ reader, ...options }),
        });
      }
      if (
        zip.size === undefined &&
        zip.directoryOffset === undefined &&
        zip.directorySize === undefined
      ) {
        return createLinkedPackageSource({
          url: resolveImportUrl(zip.url),
          allowManifest: false,
        });
      }
      return createPublishedPackageSource({ zip });
    },
  };
  return client;
};

/** A manifest at `url` whose files are fetched relative to it. */
export const createUrlPackageSource = ({ client, url }) => {
  let manifestUrl;
  return {
    async readManifest({ signal } = {}) {
      const result = await client.fetchManifest({ url, signal });
      manifestUrl = result.manifestUrl;
      return result;
    },
    readFile: ({ descriptor, signal } = {}) =>
      client.downloadFile({ descriptor, manifestUrl, signal }),
  };
};

const MANIFEST_ENTRY = "asset-package.json";

const isByteCount = (value) => Number.isSafeInteger(value) && value >= 0;

// A file's entry in the package: its `source.url` inside the package, such
// as `./files/<id>`, without the leading `./`.
const packageEntryName = (descriptor) => {
  const sourceUrl = `${descriptor?.source?.url ?? descriptor?.url ?? ""}`;
  const name = sourceUrl.replace(/^\.\//, "");
  if (
    !name ||
    name.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(name) ||
    name.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw createClientError("file_not_found", "A package file was not found.");
  }
  return name;
};

/**
 * A package ZIP, whose manifest and files are its entries. `locate()` gives
 * the `reader` for its bytes and where its central directory is;
 * `manifestUrl` names where the package came from.
 */
const createZipPackageSource = ({
  client,
  cryptoImpl,
  manifestUrl,
  locate,
}) => {
  let opened;

  return {
    async readManifest({ signal } = {}) {
      const { reader, directoryOffset, directorySize } = await locate({
        signal,
      });
      if (directorySize > client.limits.directoryBytes) {
        throw createClientError(
          "manifest_too_large",
          "Import data exceeds the allowed size.",
        );
      }
      opened = await openRemoteZip({
        directoryOffset,
        directorySize,
        // Exactly the bytes asked for, wherever they come from.
        async readRange(start, end, options) {
          const bytes = await reader.read(start, end, options);
          if (bytes.byteLength !== end - start + 1) throw invalidPackage();
          return bytes;
        },
        signal,
      });
      const bytes = await opened.readEntry(MANIFEST_ENTRY, {
        signal,
        maxBytes: client.limits.manifestBytes,
        kind: "manifest",
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
        manifestUrl,
        byteLength: bytes.byteLength,
      };
    },

    async readFile({ descriptor, signal } = {}) {
      if (!opened) {
        throw createClientError(
          "package_invalid",
          "The asset package could not be read.",
        );
      }
      const name = packageEntryName(descriptor);
      if (
        Number.isFinite(descriptor?.size) &&
        descriptor.size > client.limits.fileBytes
      ) {
        throw createClientError(
          "file_too_large",
          "A package file exceeds the allowed size.",
        );
      }
      if (
        Number.isFinite(descriptor?.size) &&
        opened.has(name) &&
        opened.sizeOf(name) !== descriptor.size
      ) {
        throw createClientError(
          "integrity_mismatch",
          "A package file failed integrity validation.",
        );
      }
      const bytes = await opened.readEntry(name, {
        signal,
        maxBytes: client.limits.fileBytes,
        kind: "file",
      });
      await verifySha256({
        bytes,
        expectedSha256: descriptor?.sha256,
        cryptoImpl,
      });
      return {
        bytes,
        byteLength: bytes.byteLength,
        contentType: descriptor?.mimeType || "application/octet-stream",
        resolvedUrl: `${manifestUrl}#${name}`,
      };
    },
  };
};

export const IMPORT_PACKAGE_CLIENT_LIMITS = DEFAULT_LIMITS;
