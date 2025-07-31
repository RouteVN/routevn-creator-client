export const createFontManager = () => {
  return {
    async load(fontName, fontUrl) {
      // Check if font is already loaded
      const existingFont = Array.from(document.fonts).find(
        (font) => font.family === fontName,
      );
      if (existingFont) {
        return existingFont;
      }

      const fontFace = new FontFace(fontName, `url(${fontUrl})`);
      await fontFace.load();
      document.fonts.add(fontFace);
      return fontFace;
    },
  };
};

export const loadFontFile = ({ getFileContent, fontManager }) => {
  return async (fontItem) => {
    try {
      const response = await getFileContent({
        fileId: fontItem.fileId,
        projectId: "someprojectId",
      });

      if (response?.url) {
        await fontManager.load(fontItem.fontFamily, response.url);
        return {
          success: true,
          fontItem,
        };
      }
      return { success: false, error: "No URL received" };
    } catch (error) {
      console.error(`Failed to load font ${fontItem.name}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  };
};
