import {
  runAsyncOperation,
  getAssetTimeoutMs,
} from "../../../internal/asyncOperation.js";
import {
  createFontAssetError,
  isFontAssetError,
} from "../../../internal/fontAssetError.js";

const normalizeFontFamily = (value) =>
  String(value ?? "").replace(/^['"]|['"]$/g, "");

export const loadFont = async (
  fontName,
  fontUrl,
  { weight: fontWeightDescriptor, cache = true, signal, timeoutMs } = {},
) => {
  const existingFont = Array.from(document.fonts).find(
    (font) =>
      normalizeFontFamily(font.family) === normalizeFontFamily(fontName) &&
      (fontWeightDescriptor === undefined ||
        font.weight === fontWeightDescriptor),
  );
  if (cache && existingFont) {
    return existingFont;
  }

  const descriptors = {};
  if (fontWeightDescriptor !== undefined) {
    descriptors.weight = fontWeightDescriptor;
  }
  try {
    const fontFace = new FontFace(fontName, `url(${fontUrl})`, descriptors);
    await runAsyncOperation(() => fontFace.load(), {
      signal,
      timeoutMs,
      label: `Decode font ${fontName}`,
    });
    document.fonts.add(fontFace);
    return fontFace;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error.name === "TimeoutError")
      throw createFontAssetError(fontName, "font_load_timeout", error);
    if (isFontAssetError(error)) throw error;
    throw createFontAssetError(fontName, "font_load_failed", error);
  }
};

export const loadFontBuffer = async (
  fontName,
  fontBuffer,
  fontType,
  options = {},
) => {
  const fontUrl = URL.createObjectURL(
    new Blob([fontBuffer], {
      type: fontType,
    }),
  );

  try {
    return await loadFont(fontName, fontUrl, {
      timeoutMs: getAssetTimeoutMs({ size: fontBuffer.byteLength }),
      ...options,
    });
  } finally {
    URL.revokeObjectURL(fontUrl);
  }
};
