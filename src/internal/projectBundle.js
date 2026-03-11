/**
 * Bundle Utils - Core bundling logic
 *
 * File format structure:
 * [version(1)] [indexLength(4)] [reserved(11)] [index(JSON)] [assets...] [instructions(JSON)]
 * Total header size: 16 bytes
 */

/**
 * Bundles project data and assets into a single file
 * @param {Object} projectData - Project data object
 * @param {Object} assets - Map of asset URLs to buffer/mime data
 * @returns {Uint8Array} Bundled file as byte array
 */
export const createBundle = async (projectData, assets = {}) => {
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
