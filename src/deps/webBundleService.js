import JSZip from "jszip";

/**
 * Bundle Service for Web - Handles project bundling with browser-based downloads
 */
export const createWebBundleService = () => {
  /**
   * Bundles project data and assets into a single file
   * @param {Object} projectData - Project data object
   * @param {Object} assets - Map of asset URLs to buffer/mime data
   * @returns {Uint8Array} Bundled file as byte array
   */
  const createBundle = async (projectData, assets = {}) => {
    const arrayBuffers = [];
    let currentOffset = 0;

    // Add all assets (keyed by fileId or URL)
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

    // Add project data as "instructions"
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

    // Create index file
    const indexFile = arrayBuffers.reduce((acc, item) => {
      acc[item.id] = {
        start: item.start,
        end: item.end,
        mime: item.mime,
      };
      return acc;
    }, {});

    // Convert index to bytes
    const indexFileBytes = new TextEncoder().encode(JSON.stringify(indexFile));

    const engineVersion = 1;
    const headerBuffer = new Uint8Array(16);
    headerBuffer[0] = engineVersion;
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

  /**
   * Exports a project as a bundle file
   * @param {Object} projectData - Project data
   * @param {Object} files - Pre-fetched file buffers keyed by fileId
   * @returns {Uint8Array} Bundle data
   */
  const exportProject = async (projectData, files = {}) => {
    return createBundle(projectData, files);
  };

  /**
   * Helper to trigger a download in the browser.
   * @param {Blob} blob - The data blob to download.
   * @param {string} filename - The name of the file.
   */
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Downloads bundle data as a file.
   * @param {Uint8Array} bundle - Bundle data
   * @param {string} filename - Default filename
   */
  const downloadBundle = async (bundle, filename) => {
    const blob = new Blob([bundle], { type: "application/octet-stream" });
    downloadBlob(blob, filename);
    return filename; // Return filename for consistency
  };

  /**
   * Creates a ZIP file containing the bundle and static files.
   * @param {Uint8Array} bundle - Bundle data
   * @param {string} zipName - Name for the ZIP file (without extension)
   */
  const createDistributionZip = async (bundle, zipName) => {
    const zip = new JSZip();
    zip.file("package.bin", bundle);

    try {
      const indexResponse = await fetch("/bundle/index.html");
      const indexContent = await indexResponse.text();
      zip.file("index.html", indexContent);

      const mainJsResponse = await fetch("/bundle/main.js");
      const mainJsContent = await mainJsResponse.text();
      zip.file("main.js", mainJsContent);
    } catch (error) {
      console.error("Failed to fetch static bundle files:", error);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, `${zipName}.zip`);
    return `${zipName}.zip`;
  };

  return {
    createBundle,
    exportProject,
    downloadBundle,
    createDistributionZip,
  };
};