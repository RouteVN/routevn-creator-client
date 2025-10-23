/**
 * Determines the MIME type of a font file by checking magic numbers or file extension
 * @param {Object} result - The file upload result object
 * @param {File} result.file - The file object
 * @param {ArrayBuffer} [result.arrayBuffer] - Optional array buffer of file content
 * @param {Buffer} [result.buffer] - Optional buffer of file content
 * @param {string} [result.type] - Optional type hint
 * @returns {string} The MIME type of the file
 */
export const getFileType = (result) => {
  if (result.file.type) return result.file.type;

  // Check magic numbers from bytes for font formats
  if (result.arrayBuffer || result.buffer) {
    const bytes = new Uint8Array(result.arrayBuffer || result.buffer);

    // TTF: starts with 0x00010000 or "true" (0x74727565)
    if (bytes.length >= 4) {
      const magic =
        (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];

      // TTF signatures
      if (magic === 0x00010000 || magic === 0x74727565) {
        return "font/ttf";
      }

      // OTF: starts with "OTTO" (0x4F54544F)
      if (magic === 0x4f54544f) {
        return "font/otf";
      }

      // WOFF: starts with "wOFF" (0x774F4646)
      if (magic === 0x774f4646) {
        return "font/woff";
      }

      // WOFF2: starts with "wOF2" (0x774F4632)
      if (magic === 0x774f4632) {
        return "font/woff2";
      }

      // TTC: starts with "ttcf" (0x74746366)
      if (magic === 0x74746366) {
        return "font/ttc";
      }

      // EOT: starts with 0x02000100 or 0x01000200 (little endian)
      if (
        magic === 0x02000100 ||
        magic === 0x01000200 ||
        (bytes[0] === 0x00 &&
          bytes[1] === 0x01 &&
          bytes[2] === 0x00 &&
          bytes[3] === 0x02)
      ) {
        return "font/eot";
      }
    }
  }

  // Fallback to extension-based detection
  const ext = result.displayName.split(".").pop()?.toLowerCase();
  if (result.type === "font" && ext) {
    return `font/${ext}`;
  }
  throw new Error("Unknown file type");
};

export const getAcceptAttribute = (acceptedFileTypes) => {
  if (!acceptedFileTypes || acceptedFileTypes.length === 0) {
    return "*/*"; // Accept all files if no types specified
  }
  return acceptedFileTypes.join(",");
};

export const isFileTypeAccepted = (file, acceptedFileTypes) => {
  if (!acceptedFileTypes || acceptedFileTypes.length === 0) {
    return true; // Accept all files if no types specified
  }

  const fileName = file.name.toLowerCase();
  return acceptedFileTypes.some((type) => {
    const extension = type.toLowerCase();
    return fileName.endsWith(extension);
  });
};
