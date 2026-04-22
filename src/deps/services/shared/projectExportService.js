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
export const BUNDLE_PLAYER_INDEX_HTML = `<html>
  <head>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: #000;
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
            100vh * var(--project-screen-width) / var(--project-screen-height)
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
        color: #fff;
        background: #000;
        font: 600 24px/1.2 sans-serif;
        letter-spacing: 0.02em;
        z-index: 10;
        user-select: none;
      }

      #loading.ready {
        cursor: pointer;
      }

      #loading.hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <div id="loading">Loading...</div>
    <div id="canvas"></div>
  </body>
  <script src="./main.js" type="module"></script>
</html>
`;
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
  return {
    projectData,
    bundleMetadata: {
      bundler: {
        appName: bundler?.appName ?? BUNDLE_APP_NAME,
        appVersion: bundler?.appVersion ?? "",
      },
      project: {
        namespace: project?.namespace ?? "",
      },
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

const getBundleStaticFiles = async () => {
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
  return {
    indexHtml: BUNDLE_PLAYER_INDEX_HTML,
    mainJs,
  };
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
        staticFiles: await getBundleStaticFiles(),
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
      staticFiles: await getBundleStaticFiles(),
      getCurrentReference,
      getFileContent,
    });
  };

  return service;
};
