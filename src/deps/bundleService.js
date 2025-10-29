/**
 * Bundle Service - Handles project bundling and unbundling
 *
 * File format structure:
 * [version(1)] [indexLength(4)] [reserved(11)] [index(JSON)] [assets...] [instructions(JSON)]
 * Total header size: 16 bytes
 */

import JSZip from "jszip";
import { writeFile } from "@tauri-apps/plugin-fs";
import { createTauriDialog } from "./tauriDialog.js";

export const createBundleService = () => {
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

    // Create header
    // Use hardcoded engine version (currently 1)
    const engineVersion = 1;

    // Create fixed 16-byte header
    const headerBuffer = new Uint8Array(16);

    // Byte 0: Engine version (1 byte)
    headerBuffer[0] = engineVersion;

    // Bytes 1-4: JSON length (4 bytes, big-endian)
    const lengthView = new DataView(headerBuffer.buffer);
    lengthView.setUint32(1, indexFileBytes.length, false);

    // Bytes 5-15: Reserved for future use (11 bytes)
    // These remain as zeros

    const headerSize = headerBuffer.length;

    // Calculate total bundle size: header + index + data
    const totalSize = headerSize + indexFileBytes.length + currentOffset;
    const finalBundle = new Uint8Array(totalSize);
    finalBundle.set(headerBuffer, 0);
    finalBundle.set(indexFileBytes, headerSize);

    // Add all assets and instructions
    // Calculate data block start position (after header and index)
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
   * Downloads bundle data as a file with path selection (Tauri only)
   * @param {Uint8Array} bundle - Bundle data
   * @param {string} filename - Default filename
   * @param {Object} options - Download options
   */
  const downloadBundle = async (bundle, filename, options = {}) => {
    try {
      const dialog = createTauriDialog();

      const selectedPath = await dialog.saveFileDialog({
        title: options.title || "Save Bundle File",
        defaultPath: filename,
        filters: [
          {
            name: "Visual Novel Bundle",
            extensions: ["bin"],
          },
        ],
      });

      if (selectedPath) {
        await writeFile(selectedPath, bundle);
        return selectedPath;
      }
      return null;
    } catch (error) {
      console.error("Error saving bundle with dialog:", error);
      throw error;
    }
  };

  /**
   * Creates a ZIP file containing the bundle and static files with path selection (Tauri only)
   * @param {Uint8Array} bundle - Bundle data
   * @param {string} zipName - Name for the ZIP file (without extension)
   * @param {Object} options - Options for the save dialog
   */
  const createDistributionZip = async (bundle, zipName, options = {}) => {
    try {
      const zip = new JSZip();

      // Add package.bin
      zip.file("package.bin", bundle);

      // Fetch and add static bundle files
      try {
        // Fetch index.html
        const indexResponse = await fetch("/bundle/index.html");
        const indexContent = await indexResponse.text();
        zip.file("index.html", indexContent);

        // Fetch main.js
        const mainJsResponse = await fetch("/bundle/main.js");
        const mainJsContent = await mainJsResponse.text();
        zip.file("main.js", mainJsContent);
      } catch (error) {
        console.error("Failed to fetch static bundle files:", error);
        // If static files can't be fetched, still create zip with just the bundle
      }

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: "uint8array" });

      const dialog = createTauriDialog();

      const selectedPath = await dialog.saveFileDialog({
        title: options.title || "Save Distribution ZIP",
        defaultPath: `${zipName}.zip`,
        filters: [
          {
            name: "ZIP Archive",
            extensions: ["zip"],
          },
        ],
      });

      if (selectedPath) {
        await writeFile(selectedPath, zipBlob);
        return selectedPath;
      }
      return null;
    } catch (error) {
      console.error("Error saving distribution ZIP with dialog:", error);
      throw error;
    }
  };

  // Public API
  return {
    createBundle,
    exportProject,
    downloadBundle,
    createDistributionZip,
  };
};
