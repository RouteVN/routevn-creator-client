import {
  createFontAssetError,
  isFontAssetError,
} from "../../../internal/fontAssetError.js";

const normalizeFontFamily = (value) =>
  String(value ?? "").replace(/^['"]|['"]$/g, "");

export const loadFont = async (
  fontName,
  fontUrl,
  { weight: fontWeightDescriptor, cache = true } = {},
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
  let timeout;
  try {
    const fontFace = new FontFace(fontName, `url(${fontUrl})`, descriptors);
    await Promise.race([
      fontFace.load(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(createFontAssetError(fontName, "font_load_timeout")),
          15000,
        );
      }),
    ]);
    document.fonts.add(fontFace);
    return fontFace;
  } catch (error) {
    if (isFontAssetError(error)) throw error;
    throw createFontAssetError(fontName, "font_load_failed", error);
  } finally {
    clearTimeout(timeout);
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
    return await loadFont(fontName, fontUrl, options);
  } finally {
    URL.revokeObjectURL(fontUrl);
  }
};
