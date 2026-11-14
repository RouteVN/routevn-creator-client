import { getProjectOrientation } from "../../../internal/projectResolution.js";
import { normalizeWebScreenFadeDuration } from "../../../internal/webExport.js";
import { extractImageThumbnail } from "../../clients/web/fileProcessors.js";

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
export const BUNDLE_WEB_ICON_192_FILE_NAME = "app-icon-192.png";
export const BUNDLE_WEB_ICON_512_FILE_NAME = "app-icon-512.png";
export const BUNDLE_WEB_ICON_FILES = [
  { fileName: BUNDLE_WEB_ICON_192_FILE_NAME, size: 192 },
  { fileName: BUNDLE_WEB_ICON_512_FILE_NAME, size: 512 },
];
const BUNDLE_PLAYER_INDEX_HTML_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="__ROUTEVN_WEB_THEME_COLOR__" />
    <meta name="application-name" content="__ROUTEVN_WEB_APPLICATION_NAME__" />
    <meta name="apple-mobile-web-app-title" content="__ROUTEVN_WEB_APPLICATION_NAME__" />
    <link rel="manifest" href="./manifest.webmanifest" />
    __ROUTEVN_WEB_ICON_LINK__
    __ROUTEVN_WEB_MAIN_PRELOAD__
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
        color: #f2f2f2;
        background: #101010;
        font: 400 20px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        z-index: 10;
        user-select: none;
        transition: opacity 200ms ease, visibility 0s 200ms;
      }

      #loading.ready {
        cursor: pointer;
      }

      /* Custom screen backgrounds. The whole image stays visible, so one that
         matches the project's aspect ratio lines up with the game canvas. */
      #loading.has-loading-background,
      #loading.has-start-background {
        background: #000;
        /* Artwork dissolves into the first scene instead of cutting to it. */
        transition:
          opacity var(--start-fade-duration, 600ms) ease-in-out,
          visibility 0s var(--start-fade-duration, 600ms);
      }

      .loading-background {
        position: absolute;
        inset: 0;
        z-index: -1;
        background: center / contain no-repeat;
      }

      /* The start image fades in over the loading image, which stays in
         place underneath, so the screen never dips to black in between. */
      #loading-start-background {
        opacity: 0;
        transition: opacity var(--loading-fade-duration, 600ms) ease-in-out;
      }

      #loading.ready #loading-start-background {
        opacity: 1;
      }

      /* A loading background replaces the loading text and progress bar. They
         stay in the page for assistive technology only. */
      #loading.has-loading-background .loading-progress {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }

      /* Without a start background, the prompt sits at the bottom centre of
         the artwork, at the same place on the image at any window size, on a
         backing that keeps it readable. */
      #loading.has-loading-background {
        --loading-art-height: min(
          var(--rvn-app-viewport-height, 100vh),
          calc(100vw / var(--loading-art-ratio, 1.7778))
        );
      }

      #loading.has-loading-background:not(.has-start-background) #loading-start {
        position: absolute;
        grid-area: auto;
        left: 50%;
        bottom: calc(50% - var(--loading-art-height) * 0.42);
        transform: translateX(-50%);
        box-sizing: border-box;
        padding: 14px 18px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.6);
      }


      /* A start background carries its own prompt: the button covers the
         screen and keeps its label for assistive technology only. */
      #loading.has-start-background #loading-start {
        position: absolute;
        inset: 0;
        grid-area: auto;
        width: 100%;
        height: 100%;
        padding: 0;
        color: transparent;
        font-size: 0;
      }

      #loading.has-start-background #loading-start:focus-visible {
        outline-offset: -6px;
      }

      .loading-progress,
      #loading-start {
        grid-area: 1 / 1;
        transition: opacity 160ms ease, visibility 0s 160ms;
      }

      .loading-progress {
        width: min(220px, 66vw);
        animation: loading-appear 160ms ease-out;
      }

      #loading.ready .loading-progress {
        opacity: 0;
        visibility: hidden;
        animation: none;
      }

      #loading.ready #loading-start {
        opacity: 1;
        visibility: visible;
        transition-delay: 80ms;
      }

      @keyframes loading-appear {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .loading-labels {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 14px;
      }

      #loading-percentage {
        color: #d0d0d0;
        font-size: 18px;
        font-variant-numeric: tabular-nums;
      }

      #loading-progress {
        appearance: none;
        display: block;
        width: 100%;
        height: 2px;
        border: 0;
        background: #333;
        color: #eee;
      }

      #loading-progress::-webkit-progress-bar {
        background: #333;
      }

      #loading-progress::-webkit-progress-value {
        background: #eee;
        transition: width 150ms ease-out;
      }

      #loading-progress::-moz-progress-bar {
        background: #eee;
        transition: width 150ms ease-out;
      }

      #loading-start {
        opacity: 0;
        visibility: hidden;
        border: 0;
        padding: 12px 22px;
        min-height: 48px;
        background: transparent;
        color: inherit;
        font: inherit;
        letter-spacing: 0.01em;
        cursor: pointer;
      }

      #loading-start:hover {
        color: #fff;
      }

      #loading-start:focus-visible {
        outline: 1px solid #b8b8b8;
        outline-offset: 4px;
      }

      #loading.error {
        cursor: default;
        text-align: left;
        user-select: text;
      }

      #loading.hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      @media (prefers-reduced-motion: reduce) {
        #loading,
        #loading.has-loading-background,
        #loading.has-start-background,
        #loading-start-background,
        .loading-progress,
        #loading-start,
        #loading.ready #loading-start {
          animation: none;
          transition: none;
        }

        #loading-progress::-webkit-progress-value {
          transition: none;
        }

        #loading-progress::-moz-progress-bar {
          transition: none;
        }
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
    __ROUTEVN_WEB_SCREEN_BACKGROUND_STYLE__
  </head>
  <body data-player-start="click">
    <div id="loading"__ROUTEVN_WEB_LOADING_CLASS__>
      <div id="loading-background" class="loading-background" aria-hidden="true"></div>
      <div id="loading-start-background" class="loading-background" aria-hidden="true"></div>
      <div class="loading-progress">
        <div class="loading-labels">
          <span id="loading-label">Loading…</span>
          <span id="loading-percentage" aria-hidden="true">0%</span>
        </div>
        <progress id="loading-progress" max="100" value="0" aria-labelledby="loading-label"></progress>
      </div>
      <button id="loading-start" type="button" disabled>Click to start</button>
    </div>
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

// The data URL is written into a stylesheet, so only plain base64 image data
// may pass.
const SCREEN_BACKGROUND_DATA_URL_PATTERN =
  /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const assertScreenBackgroundDataUrl = (dataUrl) => {
  if (!dataUrl) {
    return "";
  }
  if (!SCREEN_BACKGROUND_DATA_URL_PATTERN.test(dataUrl)) {
    throw new Error("The Web screen background is not a supported image.");
  }
  return dataUrl;
};

const createScreenBackgroundStyle = ({
  loadingBackgroundDataUrl,
  startBackgroundDataUrl,
}) => {
  const rules = [];
  if (loadingBackgroundDataUrl) {
    // Without its own image, the start screen keeps the loading one.
    rules.push(
      `#loading-background { background-image: url("${loadingBackgroundDataUrl}"); }`,
    );
  }
  if (startBackgroundDataUrl) {
    rules.push(
      `#loading-start-background { background-image: url("${startBackgroundDataUrl}"); }`,
    );
  }
  if (rules.length === 0) {
    return "";
  }
  return `<style>\n      ${rules.join("\n      ")}\n    </style>`;
};

const createLoadingClassAttribute = ({
  loadingBackgroundDataUrl,
  startBackgroundDataUrl,
  loadingBackgroundAspectRatio,
  loadingFadeDuration,
  startFadeDuration,
}) => {
  const classNames = [];
  if (loadingBackgroundDataUrl) {
    classNames.push("has-loading-background");
  }
  if (startBackgroundDataUrl) {
    classNames.push("has-start-background");
  }
  if (classNames.length === 0) {
    return "";
  }
  const declarations = [
    `--loading-fade-duration: ${loadingFadeDuration}ms`,
    `--start-fade-duration: ${startFadeDuration}ms`,
  ];
  if (loadingBackgroundAspectRatio) {
    declarations.push(`--loading-art-ratio: ${loadingBackgroundAspectRatio}`);
  }
  return ` class="${classNames.join(" ")}" style="${declarations.join("; ")}"`;
};

// Width divided by height, as a plain number for the stylesheet.
const normalizeScreenBackgroundAspectRatio = (aspectRatio) => {
  const ratio = Number(aspectRatio);
  return Number.isFinite(ratio) && ratio > 0 ? Number(ratio.toFixed(4)) : 0;
};

const normalizeWebApplicationMetadata = (web = {}) => {
  const title = web.title?.trim() || "RouteVN Player";
  return {
    title,
    themeColor: "#000000",
    backgroundColor: "#000000",
    iconFileName192: web.iconFileName192?.trim() ?? "",
    iconFileName512:
      web.iconFileName512?.trim() || web.iconFileName?.trim() || "",
    loadingBackgroundDataUrl: assertScreenBackgroundDataUrl(
      web.loadingBackgroundDataUrl,
    ),
    startBackgroundDataUrl: assertScreenBackgroundDataUrl(
      web.startBackgroundDataUrl,
    ),
    loadingBackgroundAspectRatio: normalizeScreenBackgroundAspectRatio(
      web.loadingBackgroundAspectRatio,
    ),
    loadingFadeDuration: normalizeWebScreenFadeDuration(
      web.loadingFadeDuration,
    ),
    startFadeDuration: normalizeWebScreenFadeDuration(web.startFadeDuration),
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
    "__ROUTEVN_WEB_APPLICATION_NAME__",
    escapeHtmlAttribute(metadata.title),
  );
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_THEME_COLOR__",
    escapeHtmlAttribute(metadata.themeColor),
  );
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_ICON_LINK__",
    metadata.iconFileName512
      ? `<link rel="icon" href="./${escapeHtmlAttribute(metadata.iconFileName512)}" />`
      : "",
  );
  const hasScreenBackground =
    metadata.loadingBackgroundDataUrl || metadata.startBackgroundDataUrl;
  // Inline images make the page larger; start fetching the player script
  // without waiting for the rest of the page.
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_MAIN_PRELOAD__",
    hasScreenBackground ? '<link rel="modulepreload" href="./main.js" />' : "",
  );
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_SCREEN_BACKGROUND_STYLE__",
    createScreenBackgroundStyle(metadata),
  );
  html = replaceTemplateToken(
    html,
    "__ROUTEVN_WEB_LOADING_CLASS__",
    createLoadingClassAttribute(metadata),
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
    short_name: metadata.title,
    start_url: "./",
    scope: "./",
    display: "standalone",
    theme_color: metadata.themeColor,
    background_color: metadata.backgroundColor,
  };
  if (metadata.iconFileName192 && metadata.iconFileName512) {
    manifest.icons = [
      {
        src: `./${metadata.iconFileName192}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `./${metadata.iconFileName512}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ];
  } else if (metadata.iconFileName512) {
    manifest.icons = [
      {
        src: `./${metadata.iconFileName512}`,
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
  let fullBundleRequest;
  let headerBytes;
  let manifestBytes;

  const cacheFullBundle = (bytes) => {
    if (totalLength !== undefined && bytes.byteLength !== totalLength) {
      throw new Error(
        `Full bundle response returned ${bytes.byteLength} bytes, expected ${totalLength}`,
      );
    }

    // A cached range can be mislabeled as 200. Validate the entire package
    // before treating its body as bytes starting at offset zero.
    if (
      bytes.byteLength < BUNDLE_HEADER_SIZE ||
      bytes[0] !== BUNDLE_FORMAT_VERSION_V4
    ) {
      throw new Error("Full bundle response is missing a valid bundle header.");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const payloadOffset = BUNDLE_HEADER_SIZE + view.getUint32(1, false);
    if (payloadOffset > bytes.byteLength) {
      throw new Error("Full bundle response is missing the bundle manifest.");
    }
    const manifest = JSON.parse(
      textDecoder.decode(bytes.subarray(BUNDLE_HEADER_SIZE, payloadOffset)),
    );
    let expectedLength = payloadOffset;
    for (const chunk of Object.values(manifest.chunks)) {
      expectedLength = Math.max(
        expectedLength,
        payloadOffset + chunk.start + chunk.length,
      );
    }
    if (bytes.byteLength !== expectedLength) {
      throw new Error(
        `Full bundle response returned ${bytes.byteLength} bytes, expected ${expectedLength}`,
      );
    }
    if (
      headerBytes?.some((value, index) => bytes[index] !== value) ||
      manifestBytes?.some(
        (value, index) => bytes[BUNDLE_HEADER_SIZE + index] !== value,
      )
    ) {
      throw new Error(
        "Bundle changed while loading. Reload the player to read the updated package.",
      );
    }
    fullBundleBytes = bytes;
    totalLength = bytes.byteLength;
  };

  const fetchFullBundle = async () => {
    if (!fullBundleRequest) {
      // Bypass the browser's partial-response cache and omit Range. Share
      // this recovery download between concurrent asset reads.
      fullBundleRequest = (async () => {
        const response = await fetchFn(url, { cache: "no-store" });
        if (response.status !== 200) {
          throw new Error(
            `Full bundle request failed: expected 200, received ${response.status}`,
          );
        }
        cacheFullBundle(new Uint8Array(await response.arrayBuffer()));
      })();
    }
    await fullBundleRequest;
  };

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
    if (fullBundleRequest) {
      await fullBundleRequest;
      return readCachedRange(start, length);
    }

    const response = await fetchFn(url, {
      headers: {
        range: createRangeHeader(start, length),
      },
    });

    if (response.status === 200) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!fullBundleBytes) {
        try {
          cacheFullBundle(bytes);
        } catch {
          await fetchFullBundle();
        }
      }
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

  headerBytes = await readRange(0, BUNDLE_HEADER_SIZE);
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
  manifestBytes = await readRange(BUNDLE_HEADER_SIZE, manifestLength);
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

export const WEB_SCREEN_BACKGROUND_MAX_SIZE = 1920;

// Screen backgrounds are inlined into index.html so they show before the
// player script and package load. Re-encode them to keep the page small.
const createScreenBackgroundDataUrl = async (blob) => {
  const { dataUrl, width, height } = await extractImageThumbnail(blob, {
    maxWidth: WEB_SCREEN_BACKGROUND_MAX_SIZE,
    maxHeight: WEB_SCREEN_BACKGROUND_MAX_SIZE,
    preferredFormat: "image/jpeg",
    quality: 0.85,
  });
  return { dataUrl, width, height };
};

const readScreenBackgroundDataUrls = async ({
  screenBackgrounds = {},
  getFileContent,
  createImageDataUrl,
}) => {
  const imageByFileId = new Map();
  const readImage = async (fileId) => {
    if (!fileId) {
      return undefined;
    }
    if (!imageByFileId.has(fileId)) {
      const content = await getFileContent(fileId);
      try {
        const response = await fetch(content.url);
        if (!response.ok) {
          throw new Error("The Web screen background could not be read.");
        }
        imageByFileId.set(
          fileId,
          await createImageDataUrl(await response.blob()),
        );
      } finally {
        content.revoke?.();
      }
    }
    return imageByFileId.get(fileId);
  };

  const loadingImage = await readImage(
    screenBackgrounds.loadingBackgroundFileId,
  );
  const startImage = await readImage(screenBackgrounds.startBackgroundFileId);
  const result = {
    loadingBackgroundDataUrl: loadingImage?.dataUrl,
    startBackgroundDataUrl: startImage?.dataUrl,
  };
  if (loadingImage) {
    result.loadingBackgroundAspectRatio =
      loadingImage.width / loadingImage.height;
  }
  return result;
};

const getBundleStaticFiles = async (
  projectData,
  { screenBackgrounds, getFileContent, createImageDataUrl } = {},
) => {
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
  const screenBackgroundImages = await readScreenBackgroundDataUrls({
    screenBackgrounds,
    getFileContent,
    createImageDataUrl,
  });
  const webMetadata = {
    title: projectMetadata.title,
    iconFileName192: projectMetadata.iconFileId
      ? BUNDLE_WEB_ICON_192_FILE_NAME
      : undefined,
    iconFileName512: projectMetadata.iconFileId
      ? BUNDLE_WEB_ICON_512_FILE_NAME
      : undefined,
    loadingBackgroundDataUrl: screenBackgroundImages.loadingBackgroundDataUrl,
    startBackgroundDataUrl: screenBackgroundImages.startBackgroundDataUrl,
    loadingBackgroundAspectRatio:
      screenBackgroundImages.loadingBackgroundAspectRatio,
    loadingFadeDuration: screenBackgrounds?.loadingFadeDuration,
    startFadeDuration: screenBackgrounds?.startFadeDuration,
  };
  const staticFiles = {
    indexHtml: createBundlePlayerIndexHtml(webMetadata),
    manifestJson: createBundleWebManifest(webMetadata),
    mainJs,
  };
  if (projectMetadata.iconFileId) {
    staticFiles.webIconFileId = projectMetadata.iconFileId;
    staticFiles.webIconFiles = BUNDLE_WEB_ICON_FILES;
  }
  return staticFiles;
};

export const createProjectExportService = ({
  fileAdapter,
  filePicker,
  getCurrentReference,
  getFileContent,
  createImageDataUrl = createScreenBackgroundDataUrl,
}) => {
  const getStaticFiles = (projectData, options) =>
    getBundleStaticFiles(projectData, {
      screenBackgrounds: options.webScreens,
      getFileContent,
      createImageDataUrl,
    });
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
        staticFiles: await getStaticFiles(projectData, options),
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
    options = {},
  ) => {
    return fileAdapter.createDistributionZipStreamedToPath({
      projectData,
      fileEntries: normalizeExportFileEntries(fileEntries),
      outputPath,
      options,
      staticFiles: await getStaticFiles(projectData, options),
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

  service.getAndroidExportAvailability = async (options = {}) => {
    if (typeof fileAdapter.getAndroidExportAvailability !== "function") {
      return { available: false };
    }
    return fileAdapter.getAndroidExportAvailability({ options });
  };

  service.promptAndroidApkPath = async ({ defaultFileName }, options = {}) =>
    fileAdapter.promptAndroidApkPath({ defaultFileName, options, filePicker });

  const toAndroidExportPayload = (
    projectData,
    fileEntries,
    outputPath,
    metadata,
    options,
  ) => ({
    projectData,
    fileEntries: normalizeExportFileEntries(fileEntries),
    outputPath,
    applicationName: metadata.applicationName,
    applicationId: metadata.applicationId,
    versionName: metadata.versionName,
    versionCode: metadata.versionCode,
    orientation: getProjectOrientation(projectData.projectData.screen),
    iconFileId: metadata.iconFileId,
    adaptiveIconFileId: metadata.adaptiveIconFileId,
    splashIconFileId: metadata.splashIconFileId,
    iconBackgroundColor: metadata.iconBackgroundColor,
    splashBackgroundColor: metadata.splashBackgroundColor,
    signingKey: metadata.signingKey,
    options,
    getCurrentReference,
  });

  service.createAndroidApkToPath = async (
    projectData,
    fileEntries,
    outputPath,
    metadata = {},
    options = {},
  ) =>
    fileAdapter.createAndroidApkToPath(
      toAndroidExportPayload(
        projectData,
        fileEntries,
        outputPath,
        metadata,
        options,
      ),
    );

  service.promptAndroidBundlePath = async ({ defaultFileName }, options = {}) =>
    fileAdapter.promptAndroidBundlePath({
      defaultFileName,
      options,
      filePicker,
    });

  service.createAndroidBundleToPath = async (
    projectData,
    fileEntries,
    outputPath,
    metadata = {},
    options = {},
  ) =>
    fileAdapter.createAndroidBundleToPath(
      toAndroidExportPayload(
        projectData,
        fileEntries,
        outputPath,
        metadata,
        options,
      ),
    );

  service.getIosExportAvailability = async (options = {}) => {
    if (typeof fileAdapter.getIosExportAvailability !== "function") {
      return {
        available: false,
        hostSupported: false,
        templateAvailable: false,
      };
    }
    return fileAdapter.getIosExportAvailability({ options });
  };

  service.getIosExportRequirements = async () =>
    fileAdapter.getIosExportRequirements();

  service.listIosDevices = async () => fileAdapter.listIosDevices();

  service.promptIosApplicationPath = async (
    { defaultFileName },
    options = {},
  ) =>
    fileAdapter.promptIosApplicationPath({
      defaultFileName,
      options,
      filePicker,
    });

  // `outputPath` is absent when a development build only installs on
  // `metadata.installDeviceId`.
  service.exportIosApplication = async (
    projectData,
    fileEntries,
    outputPath,
    metadata = {},
    options = {},
  ) =>
    fileAdapter.exportIosApplication({
      projectData,
      fileEntries: normalizeExportFileEntries(fileEntries),
      outputPath,
      installDeviceId: metadata.installDeviceId,
      applicationName: metadata.applicationName,
      bundleIdentifier: metadata.bundleIdentifier,
      version: metadata.version,
      buildNumber: metadata.buildNumber,
      orientation: getProjectOrientation(projectData.projectData.screen),
      iconFileId: metadata.iconFileId,
      teamId: metadata.teamId,
      distribution: metadata.distribution,
      upload: metadata.upload,
      options,
      getCurrentReference,
    });

  return service;
};
