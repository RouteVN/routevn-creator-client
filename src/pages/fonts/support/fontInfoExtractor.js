const PREVIEW_GLYPH_CHARACTERS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  ..."!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~",
];

const getSignature = (fontData) => {
  if (fontData.length < 4) {
    return "";
  }

  return Array.from(fontData.slice(0, 4))
    .map((value) => String.fromCharCode(value))
    .join("");
};

const detectFontFormat = (fontData) => {
  const signature = getSignature(fontData);

  if (signature === "wOF2") return "WOFF2";
  if (signature === "wOFF") return "WOFF";
  if (signature === "OTTO") return "OTF";
  if (signature === "ttcf") return "TTC";
  if (
    fontData[0] === 0x00 &&
    fontData[1] === 0x01 &&
    fontData[2] === 0x00 &&
    fontData[3] === 0x00
  ) {
    return "TTF";
  }
  if (signature === "true" || signature === "typ1") return "TTF";

  return "Unknown";
};

const createPreviewGlyphs = () => {
  return PREVIEW_GLYPH_CHARACTERS.map((char) => ({ char }));
};

export const createFontInfoExtractor = ({ getFileContent, loadFont }) => {
  const extractFontInfo = async (fontItem) => {
    try {
      const response = await getFileContent(fontItem.fileId);
      if (!response?.url) {
        throw new Error("Could not get font file URL.");
      }

      await loadFont(fontItem.fontFamily, response.url);
      const fontResponse = await fetch(response.url);
      const fontBuffer = await fontResponse.arrayBuffer();
      const fontData = new Uint8Array(fontBuffer);
      const format = detectFontFormat(fontData);

      return {
        itemId: fontItem.id,
        fontFamily: fontItem.fontFamily,
        fileId: fontItem.fileId,
        fileName: fontItem.name || `${fontItem.fontFamily}.ttf`,
        fileSize: `${Math.round(fontBuffer.byteLength / 1024)} KB`,
        format,
        glyphs: createPreviewGlyphs(),
      };
    } catch (error) {
      return {
        itemId: fontItem.id,
        fontFamily: fontItem.fontFamily,
        fileId: fontItem.fileId,
        fileName: fontItem.name || `${fontItem.fontFamily}.ttf`,
        fileSize: "0 KB",
        format: "Unknown",
        glyphs: createPreviewGlyphs(),
        error: error.message,
      };
    }
  };

  return {
    extractFontInfo,
  };
};
