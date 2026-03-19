const FONT_EXTENSION_TO_MIME = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  ttc: "font/ttc",
  eot: "font/eot",
};

const FONT_MIME_ALIASES = {
  "application/font-woff": "font/woff",
  "application/x-font-woff": "font/woff",
  "application/font-sfnt": "font/ttf",
  "application/x-font-truetype": "font/ttf",
  "application/x-truetype-font": "font/ttf",
  "application/vnd.ms-fontobject": "font/eot",
  "application/x-font-eot": "font/eot",
  "font/sfnt": "font/ttf",
};

const getFontMimeTypeFromExtension = (fileName = "") => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension) {
    return "";
  }

  return FONT_EXTENSION_TO_MIME[extension] ?? "";
};

const detectFontMimeTypeFromBytes = (result) => {
  if (!(result.arrayBuffer || result.buffer)) {
    return "";
  }

  const bytes = new Uint8Array(result.arrayBuffer || result.buffer);
  if (bytes.length < 4) {
    return "";
  }

  const magic =
    (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];

  if (magic === 0x00010000 || magic === 0x74727565) {
    return "font/ttf";
  }

  if (magic === 0x4f54544f) {
    return "font/otf";
  }

  if (magic === 0x774f4646) {
    return "font/woff";
  }

  if (magic === 0x774f4632) {
    return "font/woff2";
  }

  if (magic === 0x74746366) {
    return "font/ttc";
  }

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

  return "";
};

export const normalizeFontFileType = ({ fileType, fileName } = {}) => {
  const normalizedType = fileType?.trim().toLowerCase() ?? "";
  if (
    normalizedType &&
    Object.values(FONT_EXTENSION_TO_MIME).includes(normalizedType)
  ) {
    return normalizedType;
  }

  if (normalizedType && FONT_MIME_ALIASES[normalizedType]) {
    return FONT_MIME_ALIASES[normalizedType];
  }

  return getFontMimeTypeFromExtension(fileName);
};

export const formatFontFileTypeLabel = ({ fileType, fileName } = {}) => {
  const normalizedType = normalizeFontFileType({ fileType, fileName });
  if (!normalizedType) {
    return "Unknown";
  }

  return normalizedType.replace("font/", "").toUpperCase();
};

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
  const fileName = result.file?.name ?? result.displayName ?? "";
  const detectedMimeType = detectFontMimeTypeFromBytes(result);
  if (detectedMimeType) {
    return detectedMimeType;
  }

  const normalizedMimeType = normalizeFontFileType({
    fileType: result.file?.type,
    fileName,
  });
  if (normalizedMimeType) {
    return normalizedMimeType;
  }

  throw new Error("Unknown file type");
};

const normalizeAcceptedFileTypes = (acceptedFileTypes) => {
  if (Array.isArray(acceptedFileTypes)) {
    return acceptedFileTypes
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof acceptedFileTypes === "string") {
    return acceptedFileTypes
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

export const getAcceptAttribute = (acceptedFileTypes) => {
  const normalizedTypes = normalizeAcceptedFileTypes(acceptedFileTypes);
  if (normalizedTypes.length === 0) {
    return "*/*"; // Accept all files if no types specified
  }
  return normalizedTypes.join(",");
};

export const isFileTypeAccepted = (file, acceptedFileTypes) => {
  const normalizedTypes = normalizeAcceptedFileTypes(acceptedFileTypes);
  if (normalizedTypes.length === 0) {
    return true; // Accept all files if no types specified
  }

  const fileName = file.name.toLowerCase();
  return normalizedTypes.some((type) => {
    const extension = type.toLowerCase();
    return fileName.endsWith(extension);
  });
};
