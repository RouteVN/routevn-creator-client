/**
 * Bundle Service - Handles project bundling and unbundling
 *
 * File format structure:
 * [version(1)] [indexLength(8)] [index(JSON)] [assets...] [instructions(JSON)]
 */

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
    const version = 1;
    const versionBuffer = new Uint8Array([version]);
    const indexLengthBuffer = new Uint8Array(8);
    const dataView = new DataView(indexLengthBuffer.buffer);
    dataView.setBigUint64(0, BigInt(indexFileBytes.length), false);

    const headerSize =
      versionBuffer.length + indexLengthBuffer.length + indexFileBytes.length;

    // Merge all parts
    const finalBundle = new Uint8Array(headerSize + currentOffset);
    finalBundle.set(versionBuffer, 0);
    finalBundle.set(indexLengthBuffer, versionBuffer.length);
    finalBundle.set(
      indexFileBytes,
      versionBuffer.length + indexLengthBuffer.length,
    );

    // Add all assets and instructions
    for (const arrayBuffer of arrayBuffers) {
      finalBundle.set(
        new Uint8Array(arrayBuffer.responseArrayBuffer),
        arrayBuffer.start + headerSize,
      );
    }

    return finalBundle;
  };

  /**
   * Extracts project data and assets from a bundle
   * @param {ArrayBuffer|Uint8Array|string} input - Bundle data or URL
   * @returns {Object} Object containing assets and instructions
   */
  const extractBundle = async (input) => {
    let bufferData;

    // Handle different input types
    if (typeof input === "string") {
      const response = await fetch(input, {
        headers: { "Content-Type": "application/octet-stream" },
      });
      bufferData = await response.arrayBuffer();
    } else if (input instanceof ArrayBuffer) {
      bufferData = input;
    } else if (input instanceof Uint8Array) {
      bufferData = input.buffer.slice(
        input.byteOffset,
        input.byteOffset + input.byteLength,
      );
    } else {
      throw new Error("Invalid input type for bundle extraction");
    }

    const uint8View = new Uint8Array(bufferData);

    // Read version
    const version = uint8View[0];
    if (version !== 1) {
      throw new Error(`Unsupported bundle version: ${version}`);
    }

    // Read index length
    const lengthBuffer = uint8View.subarray(1, 9);
    const lengthArrayBuffer = lengthBuffer.buffer.slice(
      lengthBuffer.byteOffset,
      lengthBuffer.byteOffset + lengthBuffer.length,
    );
    const lengthView = new DataView(lengthArrayBuffer);
    const indexLength = Number(lengthView.getBigUint64(0));

    // Read index
    const headerSize = 9 + indexLength;
    const indexBuffer = uint8View.subarray(9, headerSize);
    const indexString = new TextDecoder().decode(indexBuffer);
    const index = JSON.parse(indexString);

    // Extract assets and instructions
    const assets = {};
    let instructions = null;

    for (const [id, metadata] of Object.entries(index)) {
      const contentBuffer = uint8View.subarray(
        metadata.start + headerSize,
        metadata.end + headerSize + 1,
      );

      if (id === "instructions") {
        instructions = JSON.parse(new TextDecoder().decode(contentBuffer));
      } else {
        assets[id] = {
          buffer: contentBuffer,
          type: metadata.mime,
        };
      }
    }

    return { assets, instructions };
  };

  /**
   * Exports a project as a bundle file
   * @param {Object} projectData - Project data
   * @param {Object} files - Pre-fetched file buffers keyed by fileId
   * @returns {Uint8Array} Bundle data
   */
  const exportProject = async (projectData, files = {}) => {
    return await createBundle(projectData, files);
  };

  /**
   * Downloads bundle data as a file
   * @param {Uint8Array} bundle - Bundle data
   * @param {string} filename - Download filename
   */
  const downloadBundle = (bundle, filename) => {
    const blob = new Blob([bundle], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Public API
  return {
    createBundle,
    extractBundle,
    exportProject,
    downloadBundle,
  };
};
