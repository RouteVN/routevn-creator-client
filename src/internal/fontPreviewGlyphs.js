export const FONT_PREVIEW_GLYPH_CHARACTERS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  ..."!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~",
];

export const createFontPreviewGlyphs = () =>
  FONT_PREVIEW_GLYPH_CHARACTERS.map((char) => ({ char }));

export const createFontPreviewGlyphText = ({ lineLength = 20 } = {}) => {
  const lines = [];
  for (
    let index = 0;
    index < FONT_PREVIEW_GLYPH_CHARACTERS.length;
    index += lineLength
  ) {
    lines.push(
      FONT_PREVIEW_GLYPH_CHARACTERS.slice(index, index + lineLength).join(""),
    );
  }
  return lines.join("\n");
};
