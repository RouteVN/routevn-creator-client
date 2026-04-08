/**
 * Bundle format:
 * [version(1)] [indexLength(4)] [reserved(11)] [index(JSON)] [assets...] [instructions(JSON)]
 */
export const BUNDLE_FORMAT_VERSION = 2;
export const BUNDLE_APP_NAME = "routevn-creator-client";

export const createBundleInstructions = ({ projectData, bundler }) => {
  return {
    projectData,
    bundleMetadata: {
      bundler: {
        appName: bundler?.appName ?? BUNDLE_APP_NAME,
        appVersion: bundler?.appVersion ?? "",
      },
    },
  };
};

export const createBundle = async (projectData, assets = {}) => {
  const arrayBuffers = [];
  let currentOffset = 0;

  for (const [assetId, assetData] of Object.entries(assets)) {
    if (!assetData || !assetData.buffer) {
      console.warn(`Invalid asset data for: ${assetId}`);
      continue;
    }

    arrayBuffers.push({
      id: assetId,
      start: currentOffset,
      end: currentOffset + assetData.buffer.length - 1,
      responseArrayBuffer: assetData.buffer,
      mime: assetData.mime || "application/octet-stream",
    });
    currentOffset += assetData.buffer.length;
  }

  const instructionsBuffer = new TextEncoder().encode(
    JSON.stringify(projectData),
  ).buffer;

  arrayBuffers.push({
    id: "instructions",
    start: currentOffset,
    end: currentOffset + instructionsBuffer.byteLength - 1,
    responseArrayBuffer: instructionsBuffer,
    mime: "application/json",
  });
  currentOffset += instructionsBuffer.byteLength;

  const indexFile = arrayBuffers.reduce((acc, item) => {
    acc[item.id] = {
      start: item.start,
      end: item.end,
      mime: item.mime,
    };
    return acc;
  }, {});

  const indexFileBytes = new TextEncoder().encode(JSON.stringify(indexFile));
  const headerBuffer = new Uint8Array(16);
  headerBuffer[0] = BUNDLE_FORMAT_VERSION;

  const lengthView = new DataView(headerBuffer.buffer);
  lengthView.setUint32(1, indexFileBytes.length, false);

  const headerSize = headerBuffer.length;
  const totalSize = headerSize + indexFileBytes.length + currentOffset;
  const finalBundle = new Uint8Array(totalSize);
  finalBundle.set(headerBuffer, 0);
  finalBundle.set(indexFileBytes, headerSize);

  const dataBlockStart = headerSize + indexFileBytes.length;
  for (const arrayBuffer of arrayBuffers) {
    finalBundle.set(
      new Uint8Array(arrayBuffer.responseArrayBuffer),
      arrayBuffer.start + dataBlockStart,
    );
  }

  return finalBundle;
};

const getBundleStaticFiles = async () => {
  let indexHtml;
  let mainJs;

  try {
    const indexResponse = await fetch("/bundle/index.html");
    if (indexResponse.ok) {
      indexHtml = await indexResponse.text();
    }

    const mainJsResponse = await fetch("/bundle/main.js");
    if (mainJsResponse.ok) {
      mainJs = await mainJsResponse.text();
    }
  } catch (error) {
    console.error("Failed to fetch static bundle files:", error);
  }

  return { indexHtml, mainJs };
};

export const createProjectExportService = ({
  fileAdapter,
  filePicker,
  getCurrentReference,
  getFileContent,
}) => {
  return {
    createBundle(projectData, assets) {
      return createBundle(projectData, assets);
    },

    exportProject(projectData, files) {
      return createBundle(projectData, files);
    },

    async downloadBundle(bundle, filename, options = {}) {
      return fileAdapter.downloadBundle({
        bundle,
        filename,
        options,
        filePicker,
      });
    },

    async createDistributionZip(bundle, zipName, options = {}) {
      return fileAdapter.createDistributionZip({
        bundle,
        zipName,
        options,
        filePicker,
        staticFiles: await getBundleStaticFiles(),
      });
    },

    async createDistributionZipStreamed(
      projectData,
      fileIds,
      zipName,
      options = {},
    ) {
      return fileAdapter.createDistributionZipStreamed({
        projectData,
        fileIds,
        zipName,
        options,
        filePicker,
        staticFiles: await getBundleStaticFiles(),
        getCurrentReference,
        getFileContent,
      });
    },

    ...(typeof fileAdapter.promptDistributionZipPath === "function"
      ? {
          async promptDistributionZipPath(zipName, options = {}) {
            return fileAdapter.promptDistributionZipPath({
              zipName,
              options,
              filePicker,
            });
          },
        }
      : {}),

    ...(typeof fileAdapter.createDistributionZipStreamedToPath === "function"
      ? {
          async createDistributionZipStreamedToPath(
            projectData,
            fileIds,
            outputPath,
          ) {
            return fileAdapter.createDistributionZipStreamedToPath({
              projectData,
              fileIds,
              outputPath,
              staticFiles: await getBundleStaticFiles(),
              getCurrentReference,
              getFileContent,
            });
          },
        }
      : {}),
  };
};
