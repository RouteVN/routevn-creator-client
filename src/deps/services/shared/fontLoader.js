const normalizeFontFamily = (value) =>
  String(value ?? "").replace(/^['"]|['"]$/g, "");

export const loadFont = async (
  fontName,
  fontUrl,
  { weight: fontWeightDescriptor } = {},
) => {
  const existingFont = Array.from(document.fonts).find(
    (font) =>
      normalizeFontFamily(font.family) === normalizeFontFamily(fontName) &&
      (fontWeightDescriptor === undefined ||
        font.weight === fontWeightDescriptor),
  );
  if (existingFont) {
    return existingFont;
  }

  const descriptors = {};
  if (fontWeightDescriptor !== undefined) {
    descriptors.weight = fontWeightDescriptor;
  }
  const fontFace = new FontFace(fontName, `url(${fontUrl})`, descriptors);
  await fontFace.load();
  document.fonts.add(fontFace);
  return fontFace;
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
