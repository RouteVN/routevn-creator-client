export const handleAfterMount = async (deps) => {
  const { attrs = {}, loadFontFile } = deps;
  const { fontFamily, fileId } = attrs;

  // Only load font if fontFamily and fileId are provided and not a generic fallback
  if (
    fontFamily &&
    fileId &&
    fileId !== "undefined" &&
    fontFamily !== "sans-serif" &&
    fontFamily !== "serif" &&
    fontFamily !== "monospace"
  ) {
    try {
      // Create a font item object for loadFontFile
      const fontItem = {
        fontFamily: fontFamily,
        fileId: fileId,
      };

      await loadFontFile(fontItem);
    } catch (error) {
      console.warn(`Failed to load font: ${fontFamily}`, error);
    }
  }
};
