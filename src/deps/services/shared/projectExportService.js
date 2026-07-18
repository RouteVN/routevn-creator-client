/**
 * Bundle format v4:
 * [version(1)] [manifestLength(4)] [reserved(11)] [manifest(JSON)] [unique chunks...]
 */
export const BUNDLE_FORMAT_VERSION_V4 = 4;
// The shared JS bundle writer is retained for tests and smoke scripts only.
// Shipping distribution ZIPs are produced by the native Tauri v4 exporter.
export const BUNDLE_FORMAT_VERSION = BUNDLE_FORMAT_VERSION_V4;
export const BUNDLE_HEADER_SIZE = 16;
export const BUNDLE_APP_NAME = "routevn-creator-client";
export const BUNDLE_WEB_ICON_FILE_NAME = "app-icon.png";
const BUNDLE_PLAYER_INDEX_HTML_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="__ROUTEVN_WEB_DESCRIPTION__" />
    <meta name="theme-color" content="__ROUTEVN_WEB_THEME_COLOR__" />
    <meta name="application-name" content="__ROUTEVN_WEB_SHORT_NAME__" />
    <meta name="apple-mobile-web-app-title" content="__ROUTEVN_WEB_SHORT_NAME__" />
    <link rel="manifest" href="./manifest.webmanifest" />
    __ROUTEVN_WEB_ICON_LINK__
    <title>__ROUTEVN_WEB_TITLE__</title>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: __ROUTEVN_WEB_BACKGROUND_COLOR__;
      }

      body {
        display: grid;
        place-items: center;
      }

      #canvas {
        --project-screen-width: 16;
        --project-screen-height: 9;
        width: min(
          100vw,
          calc(
            var(--rvn-app-viewport-height, 100vh) *
              var(--project-screen-width) / var(--project-screen-height)
          )
        );
        aspect-ratio: var(--project-screen-width) / var(--project-screen-height);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #canvas canvas {
        width: 100% !important;
        height: 100% !important;
        display: block;
      }

      #loading {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        box-sizing: border-box;
        padding: 24px;
        color: #fff;
        background: __ROUTEVN_WEB_BACKGROUND_COLOR__;
        font: 600 24px/1.2 sans-serif;
        letter-spacing: 0.02em;
        z-index: 10;
        user-select: none;
      }

      #loading.ready {
        cursor: pointer;
      }

      #loading.error {
        cursor: default;
        text-align: left;
        user-select: text;
      }

      #loading.hidden {
        display: none;
      }

      #loading .loading-error {
        width: min(760px, calc(100vw - 32px));
      }

      #loading .loading-error-title {
        margin: 0 0 8px;
        font: 700 24px/1.2 sans-serif;
      }

      #loading .loading-error-summary {
        margin: 0 0 16px;
        color: #f1f5f9;
        font: 500 15px/1.45 sans-serif;
      }

      #loading .loading-error-details {
        box-sizing: border-box;
        width: 100%;
        max-height: min(58vh, 520px);
        margin: 0;
        overflow: auto;
        padding: 12px;
        border: 1px solid #334155;
        border-radius: 6px;
        background: #0f172a;
        color: #e2e8f0;
        font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body data-player-start="click">
    <div id="loading">Loading...</div>
    <div id="canvas"></div>
  </body>
  <script>
    (() => {
      const originalFetch = window.fetch.bind(window);
      const embeddedPackageChunkSize = 1024 * 1024;

      const getHeaderValue = (headers, name) => {
        if (!headers) {
          return "";
        }

        const normalizedName = name.toLowerCase();

        if (typeof headers.get === "function") {
          return headers.get(name) || headers.get(normalizedName) || "";
        }

        if (Array.isArray(headers)) {
          const entry = headers.find(
            ([key]) => String(key).toLowerCase() === normalizedName,
          );
          return entry?.[1] || "";
        }

        if (typeof headers === "object") {
          const entry = Object.entries(headers).find(
            ([key]) => String(key).toLowerCase() === normalizedName,
          );
          return entry?.[1] || "";
        }

        return "";
      };

      const getRangeHeader = (input, init) => {
        return (
          getHeaderValue(init?.headers, "range") ||
          getHeaderValue(input?.headers, "range")
        );
      };

      const parseRangeHeader = (rangeHeader, totalLength) => {
        if (!rangeHeader) {
          return undefined;
        }

        const match = /^bytes=(\\d*)-(\\d*)$/.exec(rangeHeader.trim());
        if (!match || totalLength === 0) {
          return { invalid: true };
        }

        let start;
        let end;

        if (match[1] === "") {
          const suffixLength = Number(match[2]);
          if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
            return { invalid: true };
          }
          start = Math.max(totalLength - suffixLength, 0);
          end = totalLength - 1;
        } else {
          start = Number(match[1]);
          end = match[2] === "" ? totalLength - 1 : Number(match[2]);
        }

        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          end < start ||
          start >= totalLength
        ) {
          return { invalid: true };
        }

        return {
          start,
          end: Math.min(end, totalLength - 1),
        };
      };

      const createEmbeddedPackageResponse = async ({ invoke, rangeHeader }) => {
        const info = await invoke("get_embedded_package_info");
        const totalLength = Number(info?.byteLength || 0);
        if (!rangeHeader) {
          return new Response(null, {
            status: 416,
            headers: {
              "accept-ranges": "bytes",
              "content-range": "bytes */" + totalLength,
            },
          });
        }

        const parsedRange = parseRangeHeader(rangeHeader, totalLength);

        if (parsedRange?.invalid) {
          return new Response(null, {
            status: 416,
            headers: {
              "accept-ranges": "bytes",
              "content-range": "bytes */" + totalLength,
            },
          });
        }

        const start = parsedRange?.start ?? 0;
        const end = parsedRange?.end ?? totalLength - 1;
        const contentLength = Math.max(end - start + 1, 0);
        let cursor = start;

        const stream = new ReadableStream({
          async pull(controller) {
            if (cursor > end || contentLength === 0) {
              controller.close();
              return;
            }

            const length = Math.min(
              embeddedPackageChunkSize,
              end - cursor + 1,
            );
            const bytes = await invoke("read_embedded_package_range", {
              offset: cursor,
              length,
            });
            const normalizedBytes =
              bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

            if (normalizedBytes.byteLength === 0) {
              controller.close();
              return;
            }

            cursor += normalizedBytes.byteLength;
            controller.enqueue(normalizedBytes);
          },
        });

        const headers = {
          "accept-ranges": "bytes",
          "content-length": String(contentLength),
          "content-type": "application/octet-stream",
        };
        if (parsedRange) {
          headers["content-range"] =
            "bytes " + start + "-" + end + "/" + totalLength;
        }

        return new Response(stream, {
          status: parsedRange ? 206 : 200,
          headers,
        });
      };

      window.fetch = async (input, init) => {
        const rawUrl = typeof input === "string" ? input : input?.url;

        if (rawUrl) {
          try {
            const resolvedUrl = new URL(rawUrl, window.location.href);
            const invoke = window.__TAURI__?.core?.invoke;

            if (resolvedUrl.pathname.endsWith("/package.bin") && invoke) {
              try {
                return await createEmbeddedPackageResponse({
                  invoke,
                  rangeHeader: getRangeHeader(input, init),
                });
              } catch (error) {
                console.warn("Falling back to package.bin fetch.", error);
              }
            }
          } catch {}
        }

        return originalFetch(input, init);
      };
    })();
  </script>
  <script src="./main.js" type="module"></script>
</html>
`;

const normalizeWebApplicationMetadata = (web = {}) => {
  const title = web.title?.trim() || "RouteVN Player";
  return {
    title,
    shortName: web.shortName?.trim() || title,
    description: web.description?.trim() ?? "",
    themeColor: web.themeColor?.trim() || "#000000",
    backgroundColor: web.backgroundColor?.trim() || "#000000",
    iconFileName: web.iconFileName?.trim() ?? "",
  };
};

const escapeHtmlAttribute = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const replaceTemplateToken = (template, token, value) =>
  template.split(token).join(value);

export const createBundlePlayerIndexHtml = (web = {}) => {
  const metadata = normalizeWebApplicationMetadata(web);
  let html = BUNDLE_PLAYER_INDEX_HTML_TEMPLATE;
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_TITLE__",
    escapeHtmlAttribute(metadata.title),
  );
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_SHORT_NAME__",
    escapeHtmlAttribute(metadata.shortName),
  );
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_DESCRIPTION__",
    escapeHtmlAttribute(metadata.description),
  );
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_THEME_COLOR__",
    escapeHtmlAttribute(metadata.themeColor),
  );
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_ICON_LINK__",
    metadata.iconFileName
      ? `<link rel="icon" href="./${escapeHtmlAttribute(metadata.iconFileName)}" />`
      : "",
  );
  return replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_BACKGROUND_COLOR__",
    escapeHtmlAttribute(metadata.backgroundColor),
  );
};

export const createBundleWebManifest = (web = {}) => {
  const metadata = normalizeWebApplicationMetadata(web);
  const manifest = {
    name: metadata.title,
    short_name: metadata.shortName,
    description: metadata.description,
    start_url: "./",
    scope: "./",
    display: "standalone",
    theme_color: metadata.themeColor,
    background_color: metadata.backgroundColor,
  };
  if (metadata.iconFileName) {
    manifest.icons = [
      {
        src: `./${metadata.iconFileName}`,
        type: "image/png",
        purpose: "any",
      },
    ];
  }
  return JSON.stringify(manifest, undefined, 2);
};

export const BUNDLE_PLAYER_INDEX_HTML = createBundlePlayerIndexHtml();
const BUNDLE_MANIFEST_CHUNKING = Object.freeze({
  algorithm: "none",
  mode: "whole-file-only",
});

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toArrayBufferSlice = (value) => {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  );
};

const toUint8Array = (value) => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array();
};

const bytesToHex = (value) => {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const hashChunkBytes = async (bytes) => {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    toArrayBufferSlice(bytes),
  );
  return bytesToHex(digest);
};

const splitBytesIntoChunks = async ({ bytes }) => {
  const normalizedBytes = toUint8Array(bytes);
  if (normalizedBytes.byteLength === 0) {
    return [];
  }

  return [normalizedBytes.slice()];
};

const createBundleHeader = (version, metadataLength) => {
  const headerBuffer = new Uint8Array(BUNDLE_HEADER_SIZE);
  headerBuffer[0] = version;

  const lengthView = new DataView(headerBuffer.buffer);
  lengthView.setUint32(1, metadataLength, false);

  return headerBuffer;
};

const buildChunkManifest = async (instructions, assets = {}) => {
  const chunkPayloads = new Map();
  const assetEntries = {};
  let rawAssetBytes = 0;
  let chunkReferenceCount = 0;

  const registerEntry = async ({ entryId, mime, bytes }) => {
    const normalizedBytes = toUint8Array(bytes);
    const chunkIds = [];

    rawAssetBytes +=
      entryId === "instructions" ? 0 : normalizedBytes.byteLength;

    for (const chunkBytes of await splitBytesIntoChunks({
      bytes: normalizedBytes,
    })) {
      const chunkId = await hashChunkBytes(chunkBytes);
      if (!chunkPayloads.has(chunkId)) {
        chunkPayloads.set(chunkId, chunkBytes);
      }

      chunkIds.push(chunkId);
      chunkReferenceCount += 1;
    }

    return {
      encoding: "raw",
      mime,
      size: normalizedBytes.byteLength,
      chunks: chunkIds,
    };
  };

  for (const [assetId, assetData] of Object.entries(assets)) {
    if (!assetData || !assetData.buffer) {
      console.warn(`Invalid asset data for: ${assetId}`);
      continue;
    }

    assetEntries[assetId] = await registerEntry({
      entryId: assetId,
      mime: assetData.mime || "application/octet-stream",
      bytes: assetData.buffer,
    });
  }

  const instructionsEntry = await registerEntry({
    entryId: "instructions",
    mime: "application/json",
    bytes: textEncoder.encode(JSON.stringify(instructions)),
  });

  let currentOffset = 0;
  const chunks = {};
  for (const [chunkId, chunkBytes] of chunkPayloads.entries()) {
    chunks[chunkId] = {
      start: currentOffset,
      length: chunkBytes.byteLength,
      sha256: chunkId,
    };
    currentOffset += chunkBytes.byteLength;
  }

  return {
    manifest: {
      chunking: BUNDLE_MANIFEST_CHUNKING,
      chunks,
      assets: assetEntries,
      atlases: {},
      instructions: instructionsEntry,
    },
    chunkPayloads,
    stats: {
      assetCount: Object.keys(assetEntries).length,
      rawAssetBytes,
      uniqueChunkCount: chunkPayloads.size,
      chunkReferenceCount,
      storedChunkBytes: currentOffset,
    },
  };
};

export const createBundleInstructions = ({ projectData, bundler, project }) => {
  const projectTitle = project?.title ?? project?.name ?? "";
  const projectMetadata = {
    namespace: project?.namespace ?? "",
    title: projectTitle,
    iconFileId: project?.iconFileId ?? "",
  };
  if (project?.web) {
    projectMetadata.web = {
      shortName: project.web.shortName ?? "",
      description: project.web.description ?? "",
      themeColor: project.web.themeColor ?? "",
      backgroundColor: project.web.backgroundColor ?? "",
    };
  }

  return {
    projectData,
    bundleMetadata: {
      bundler: {
        appName: bundler?.appName ?? BUNDLE_APP_NAME,
        appVersion: bundler?.appVersion ?? "",
      },
      project: projectMetadata,
    },
  };
};

export const createBundleResult = async (instructions, assets = {}) => {
  const { manifest, chunkPayloads, stats } = await buildChunkManifest(
    instructions,
    assets,
  );
  const manifestBytes = textEncoder.encode(JSON.stringify(manifest));
  const headerBuffer = createBundleHeader(
    BUNDLE_FORMAT_VERSION,
    manifestBytes.length,
  );
  const chunkPayloadBytes = Array.from(chunkPayloads.values()).reduce(
    (sum, chunkBytes) => sum + chunkBytes.byteLength,
    0,
  );
  const totalSize =
    BUNDLE_HEADER_SIZE + manifestBytes.length + chunkPayloadBytes;
  const finalBundle = new Uint8Array(totalSize);
  finalBundle.set(headerBuffer, 0);
  finalBundle.set(manifestBytes, BUNDLE_HEADER_SIZE);

  let chunkPayloadOffset = BUNDLE_HEADER_SIZE + manifestBytes.length;
  for (const chunkBytes of chunkPayloads.values()) {
    finalBundle.set(chunkBytes, chunkPayloadOffset);
    chunkPayloadOffset += chunkBytes.byteLength;
  }

  const dedupedSourceBytes =
    Object.values(manifest.assets).reduce(
      (sum, asset) => sum + (asset?.size ?? 0),
      0,
    ) + (manifest.instructions?.size ?? 0);
  const dedupedBytes = Math.max(0, dedupedSourceBytes - chunkPayloadBytes);

  return {
    bundle: finalBundle,
    manifest,
    stats: {
      ...stats,
      packageBinBytes: totalSize,
      storedChunkBytes: chunkPayloadBytes,
      dedupedBytes,
    },
  };
};

export const createBundle = async (instructions, assets = {}) => {
  const { bundle } = await createBundleResult(instructions, assets);
  return bundle;
};

export const normalizeExportFileEntries = (entries = []) => {
  const normalizedEntries = [];
  const entryIndexById = new Map();

  for (const entry of entries || []) {
    const fileId =
      typeof entry?.fileId === "string"
        ? entry.fileId
        : typeof entry?.id === "string"
          ? entry.id
          : "";
    if (!fileId) {
      continue;
    }

    const mimeType =
      typeof entry?.mimeType === "string" && entry.mimeType.length > 0
        ? entry.mimeType
        : typeof entry?.mime === "string" && entry.mime.length > 0
          ? entry.mime
          : undefined;
    const existingIndex = entryIndexById.get(fileId);

    if (existingIndex !== undefined) {
      if (!normalizedEntries[existingIndex].mimeType && mimeType) {
        normalizedEntries[existingIndex] = {
          ...normalizedEntries[existingIndex],
          mimeType,
        };
      }
      continue;
    }

    const normalizedEntry = {
      id: fileId,
    };
    if (mimeType) {
      normalizedEntry.mimeType = mimeType;
    }

    normalizedEntries.push(normalizedEntry);
    entryIndexById.set(fileId, normalizedEntries.length - 1);
  }

  return normalizedEntries;
};

const reconstructChunkedEntry = ({
  metadata,
  chunks,
  chunkPayloadOffset,
  arrayBuffer,
}) => {
  const chunkIds = Array.isArray(metadata?.chunks) ? metadata.chunks : [];
  const size = Number(metadata?.size ?? 0);

  if (chunkIds.length === 0) {
    return {
      buffer: new Uint8Array(size),
      mime: metadata?.mime,
      size,
    };
  }

  const result = new Uint8Array(size);
  let offset = 0;

  chunkIds.forEach((chunkId) => {
    const chunk = chunks?.[chunkId];
    if (!chunk) {
      throw new Error(`Missing chunk metadata: ${chunkId}`);
    }

    const start = Number(chunk.start ?? 0) + chunkPayloadOffset;
    const length = Number(chunk.length ?? 0);
    const chunkBytes = new Uint8Array(arrayBuffer, start, length);
    result.set(chunkBytes, offset);
    offset += chunkBytes.byteLength;
  });

  return {
    buffer: result,
    mime: metadata?.mime,
    size,
  };
};

const reconstructChunkedEntryFromReader = async ({
  metadata,
  chunks,
  chunkPayloadOffset,
  readRange,
}) => {
  const chunkIds = Array.isArray(metadata?.chunks) ? metadata.chunks : [];
  const size = Number(metadata?.size ?? 0);

  if (chunkIds.length === 0) {
    return {
      buffer: new Uint8Array(size),
      mime: metadata?.mime,
      size,
    };
  }

  const result = new Uint8Array(size);
  let offset = 0;

  for (const chunkId of chunkIds) {
    const chunk = chunks?.[chunkId];
    if (!chunk) {
      throw new Error(`Missing chunk metadata: ${chunkId}`);
    }

    const start = Number(chunk.start ?? 0) + chunkPayloadOffset;
    const length = Number(chunk.length ?? 0);
    const chunkBytes = await readRange(start, length);
    result.set(chunkBytes, offset);
    offset += chunkBytes.byteLength;
  }

  return {
    buffer: result,
    mime: metadata?.mime,
    size,
  };
};

const reconstructV4AssetEntry = ({
  metadata,
  chunks,
  chunkPayloadOffset,
  arrayBuffer,
}) => {
  if (metadata?.encoding === "diced-image") {
    return {
      encoding: "diced-image",
      mime: metadata?.mime,
      size: Number(metadata?.size ?? 0),
      width: Number(metadata?.width ?? 0),
      height: Number(metadata?.height ?? 0),
      atlasId: metadata?.atlasId ?? "",
      vertices: Array.isArray(metadata?.vertices) ? metadata.vertices : [],
      uvs: Array.isArray(metadata?.uvs) ? metadata.uvs : [],
      indices: Array.isArray(metadata?.indices) ? metadata.indices : [],
      rect: metadata?.rect ?? {
        x: 0,
        y: 0,
        width: Number(metadata?.width ?? 0),
        height: Number(metadata?.height ?? 0),
      },
      pivot: metadata?.pivot ?? { x: 0, y: 0 },
    };
  }

  return reconstructChunkedEntry({
    metadata,
    chunks,
    chunkPayloadOffset,
    arrayBuffer,
  });
};

const reconstructV4AssetEntryFromReader = async ({
  metadata,
  chunks,
  chunkPayloadOffset,
  readRange,
}) => {
  if (metadata?.encoding === "diced-image") {
    return {
      encoding: "diced-image",
      mime: metadata?.mime,
      size: Number(metadata?.size ?? 0),
      width: Number(metadata?.width ?? 0),
      height: Number(metadata?.height ?? 0),
      atlasId: metadata?.atlasId ?? "",
      vertices: Array.isArray(metadata?.vertices) ? metadata.vertices : [],
      uvs: Array.isArray(metadata?.uvs) ? metadata.uvs : [],
      indices: Array.isArray(metadata?.indices) ? metadata.indices : [],
      rect: metadata?.rect ?? {
        x: 0,
        y: 0,
        width: Number(metadata?.width ?? 0),
        height: Number(metadata?.height ?? 0),
      },
      pivot: metadata?.pivot ?? { x: 0, y: 0 },
    };
  }

  return reconstructChunkedEntryFromReader({
    metadata,
    chunks,
    chunkPayloadOffset,
    readRange,
  });
};

export const parseBundle = async (bundle) => {
  const arrayBuffer = toArrayBufferSlice(toUint8Array(bundle));
  const dataView = new DataView(arrayBuffer);
  const version = dataView.getUint8(0);

  if (version !== BUNDLE_FORMAT_VERSION_V4) {
    throw new Error(`Unsupported bundle version: ${version}`);
  }

  const manifestLength = dataView.getUint32(1, false);
  const manifestBuffer = new Uint8Array(
    arrayBuffer,
    BUNDLE_HEADER_SIZE,
    manifestLength,
  );
  const manifest = JSON.parse(textDecoder.decode(manifestBuffer));
  const chunkPayloadOffset = BUNDLE_HEADER_SIZE + manifestLength;
  const assets = {};
  const atlases = {};

  if (version === BUNDLE_FORMAT_VERSION_V4) {
    Object.entries(manifest.atlases || {}).forEach(([atlasId, metadata]) => {
      atlases[atlasId] = reconstructChunkedEntry({
        metadata,
        chunks: manifest.chunks,
        chunkPayloadOffset,
        arrayBuffer,
      });
    });
  }

  Object.entries(manifest.assets || {}).forEach(([assetId, metadata]) => {
    assets[assetId] = reconstructV4AssetEntry({
      metadata,
      chunks: manifest.chunks,
      chunkPayloadOffset,
      arrayBuffer,
    });
  });

  const instructionsEntry = reconstructChunkedEntry({
    metadata: manifest.instructions,
    chunks: manifest.chunks,
    chunkPayloadOffset,
    arrayBuffer,
  });

  return {
    version,
    manifest,
    assets,
    atlases,
    instructions: JSON.parse(textDecoder.decode(instructionsEntry.buffer)),
  };
};

const createRangeHeader = (start, length) => {
  const end = start + length - 1;
  return `bytes=${start}-${end}`;
};

const getContentRangeLength = (value) => {
  const match = /^bytes\s+\d+-\d+\/(\d+)$/i.exec(value ?? "");
  if (!match) {
    return undefined;
  }

  const length = Number(match[1]);
  return Number.isSafeInteger(length) ? length : undefined;
};

export const createBundleRangeReader = async ({
  url = "./package.bin",
  fetchFn = globalThis.fetch?.bind(globalThis),
} = {}) => {
  if (typeof fetchFn !== "function") {
    throw new Error(
      "A fetch implementation is required for bundle range reads.",
    );
  }

  let totalLength;
  let fullBundleBytes;

  const readCachedRange = (start, length) => {
    if (!fullBundleBytes) {
      return undefined;
    }

    const end = start + length;
    const bytes = fullBundleBytes.slice(start, end);
    if (bytes.byteLength !== length) {
      throw new Error(
        `Bundle range request returned ${bytes.byteLength} bytes, expected ${length}`,
      );
    }

    return bytes;
  };

  const readRange = async (start, length) => {
    if (length <= 0) {
      return new Uint8Array();
    }

    const cachedBytes = readCachedRange(start, length);
    if (cachedBytes) {
      return cachedBytes;
    }

    const response = await fetchFn(url, {
      headers: {
        range: createRangeHeader(start, length),
      },
    });

    if (response.status === 200) {
      fullBundleBytes = new Uint8Array(await response.arrayBuffer());
      totalLength = fullBundleBytes.byteLength;
      return readCachedRange(start, length);
    }

    if (response.status !== 206) {
      throw new Error(
        `Bundle range request failed: expected 206 or full 200, received ${response.status}`,
      );
    }

    const contentRangeLength = getContentRangeLength(
      response.headers.get("content-range"),
    );
    if (contentRangeLength !== undefined) {
      totalLength = contentRangeLength;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== length) {
      throw new Error(
        `Bundle range request returned ${bytes.byteLength} bytes, expected ${length}`,
      );
    }

    return bytes;
  };

  const headerBytes = await readRange(0, BUNDLE_HEADER_SIZE);
  const headerView = new DataView(
    headerBytes.buffer,
    headerBytes.byteOffset,
    headerBytes.byteLength,
  );
  const version = headerView.getUint8(0);
  if (version !== BUNDLE_FORMAT_VERSION_V4) {
    throw new Error(`Unsupported bundle version: ${version}`);
  }

  const manifestLength = headerView.getUint32(1, false);
  const manifestBytes = await readRange(BUNDLE_HEADER_SIZE, manifestLength);
  const manifest = JSON.parse(textDecoder.decode(manifestBytes));
  const chunkPayloadOffset = BUNDLE_HEADER_SIZE + manifestLength;

  const readChunkedEntry = (metadata) =>
    reconstructChunkedEntryFromReader({
      metadata,
      chunks: manifest.chunks,
      chunkPayloadOffset,
      readRange,
    });

  const readAsset = async (assetId) => {
    const metadata = manifest.assets?.[assetId];
    if (!metadata) {
      throw new Error(`Missing asset metadata: ${assetId}`);
    }

    return reconstructV4AssetEntryFromReader({
      metadata,
      chunks: manifest.chunks,
      chunkPayloadOffset,
      readRange,
    });
  };

  const readAtlas = async (atlasId) => {
    const metadata = manifest.atlases?.[atlasId];
    if (!metadata) {
      throw new Error(`Missing atlas metadata: ${atlasId}`);
    }

    return readChunkedEntry(metadata);
  };

  const readInstructions = async () => {
    const instructionsEntry = await readChunkedEntry(manifest.instructions);
    return JSON.parse(textDecoder.decode(instructionsEntry.buffer));
  };

  return {
    version,
    manifest,
    get totalLength() {
      return totalLength;
    },
    hasAsset(assetId) {
      return !!manifest.assets?.[assetId];
    },
    readAsset,
    readAtlas,
    readInstructions,
  };
};

const getBundleStaticFiles = async (projectData) => {
  let mainJs;

  try {
    const mainJsResponse = await fetch("/bundle/main.js");
    if (mainJsResponse.ok) {
      mainJs = await mainJsResponse.text();
    }
  } catch (error) {
    console.error("Failed to fetch static bundle files:", error);
  }

  // Export must not depend on HTML transformed by an active Vite dev server.
  // Fetching /bundle/index.html in dev injects /@vite/client, which breaks
  // the exported standalone player.
  const projectMetadata = projectData?.bundleMetadata?.project ?? {};
  const webMetadata = {
    title: projectMetadata.title,
    shortName: projectMetadata.web?.shortName,
    description: projectMetadata.web?.description,
    themeColor: projectMetadata.web?.themeColor,
    backgroundColor: projectMetadata.web?.backgroundColor,
    iconFileName: projectMetadata.iconFileId
      ? BUNDLE_WEB_ICON_FILE_NAME
      : undefined,
  };
  const staticFiles = {
    indexHtml: createBundlePlayerIndexHtml(webMetadata),
    manifestJson: createBundleWebManifest(webMetadata),
    mainJs,
  };
  if (projectMetadata.iconFileId) {
    staticFiles.webIconFileId = projectMetadata.iconFileId;
    staticFiles.webIconFileName = BUNDLE_WEB_ICON_FILE_NAME;
  }
  return staticFiles;
};

export const createProjectExportService = ({
  fileAdapter,
  filePicker,
  getCurrentReference,
  getFileContent,
}) => {
  const service = {
    async createDistributionZipStreamed(
      projectData,
      fileEntries,
      zipName,
      options = {},
    ) {
      return fileAdapter.createDistributionZipStreamed({
        projectData,
        fileEntries: normalizeExportFileEntries(fileEntries),
        zipName,
        options,
        filePicker,
        staticFiles: await getBundleStaticFiles(projectData),
        getCurrentReference,
        getFileContent,
      });
    },
  };

  service.promptDistributionZipPath = async (zipName, options = {}) => {
    return fileAdapter.promptDistributionZipPath({
      zipName,
      options,
      filePicker,
    });
  };

  service.createDistributionZipStreamedToPath = async (
    projectData,
    fileEntries,
    outputPath,
  ) => {
    return fileAdapter.createDistributionZipStreamedToPath({
      projectData,
      fileEntries: normalizeExportFileEntries(fileEntries),
      outputPath,
      staticFiles: await getBundleStaticFiles(projectData),
      getCurrentReference,
      getFileContent,
    });
  };

  service.promptWindowsExecutablePath = async (exeName, options = {}) => {
    return fileAdapter.promptWindowsExecutablePath({
      exeName,
      options,
      filePicker,
    });
  };

  service.promptWindowsInstallerPath = async (installerName, options = {}) => {
    return fileAdapter.promptWindowsInstallerPath({
      installerName,
      options,
      filePicker,
    });
  };

  service.getWindowsExportAvailability = async (options = {}) => {
    if (typeof fileAdapter.getWindowsExportAvailability !== "function") {
      return {
        portableExecutable: false,
        installer: false,
        templateAvailable: false,
        installerHostSupported: false,
        installerToolAvailable: false,
      };
    }

    return fileAdapter.getWindowsExportAvailability({
      options,
    });
  };

  service.promptMacosApplicationPath = async (
    applicationName,
    options = {},
  ) => {
    return fileAdapter.promptMacosApplicationPath({
      applicationName,
      options,
      filePicker,
    });
  };

  service.getMacosExportAvailability = async (options = {}) => {
    if (typeof fileAdapter.getMacosExportAvailability !== "function") {
      return {
        application: false,
        templateAvailable: false,
        hostSupported: false,
        dittoAvailable: false,
        codesignAvailable: false,
        sipsAvailable: false,
        iconutilAvailable: false,
        lipoAvailable: false,
      };
    }

    return fileAdapter.getMacosExportAvailability({ options });
  };

  service.createWindowsPortableExecutableToPath = async (
    projectData,
    fileEntries,
    outputPath,
    metadata = {},
    options = {},
  ) => {
    return fileAdapter.createWindowsPortableExecutableToPath({
      projectData,
      fileEntries: normalizeExportFileEntries(fileEntries),
      outputPath,
      title: metadata.title,
      version: metadata.version,
      applicationIdentifier: metadata.applicationIdentifier,
      publisher: metadata.publisher,
      description: metadata.description,
      copyright: metadata.copyright,
      iconFileId: metadata.iconFileId,
      options,
      getCurrentReference,
    });
  };

  service.createWindowsInstallerToPath = async (
    projectData,
    fileEntries,
    outputPath,
    metadata = {},
    options = {},
  ) => {
    return fileAdapter.createWindowsInstallerToPath({
      projectData,
      fileEntries: normalizeExportFileEntries(fileEntries),
      outputPath,
      title: metadata.title,
      version: metadata.version,
      applicationIdentifier: metadata.applicationIdentifier,
      publisher: metadata.publisher,
      description: metadata.description,
      copyright: metadata.copyright,
      iconFileId: metadata.iconFileId,
      options,
      getCurrentReference,
    });
  };

  service.createMacosApplicationToPath = async (
    projectData,
    fileEntries,
    outputPath,
    metadata = {},
    options = {},
  ) => {
    return fileAdapter.createMacosApplicationToPath({
      projectData,
      fileEntries: normalizeExportFileEntries(fileEntries),
      outputPath,
      title: metadata.title,
      shortVersion: metadata.shortVersion,
      bundleVersion: metadata.bundleVersion,
      applicationIdentifier: metadata.applicationIdentifier,
      publisher: metadata.publisher,
      description: metadata.description,
      copyright: metadata.copyright,
      category: metadata.category,
      iconFileId: metadata.iconFileId,
      options,
      getCurrentReference,
    });
  };

  return service;
};
