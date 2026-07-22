export const toFontIds = (fontId) =>
  Array.isArray(fontId) ? fontId : fontId ? [fontId] : [];

export const toPrimaryFontId = (fontId) => toFontIds(fontId)[0] ?? "";
