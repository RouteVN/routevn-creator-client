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

    async loadFontFromArrayBuffer(fontName, arrayBuffer) {
      // Check if font is already loaded
      const existingFont = Array.from(document.fonts).find(
        (font) => font.family === fontName,
      );
      if (existingFont) {
        return existingFont;
      }

      const fontFace = new FontFace(fontName, arrayBuffer);
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

export const loadFontsFromAssetBuffer = ({ fontManager }) => {
  return async (fontItems, bufferMap) => {
    const results = [];

    for (const fontItem of fontItems) {
      try {
        const bufferKey = `file:${fontItem.fileId}`;
        const bufferData = bufferMap[bufferKey];

        if (bufferData) {
          // Extract ArrayBuffer from the buffer data object
          const arrayBuffer = bufferData.buffer || bufferData;

          if (arrayBuffer instanceof ArrayBuffer) {
            await fontManager.loadFontFromArrayBuffer(
              fontItem.fontFamily,
              arrayBuffer,
            );
            results.push({
              success: true,
              fontItem,
            });
          } else {
            console.error(
              `Invalid buffer type for font ${fontItem.name}:`,
              typeof arrayBuffer,
              arrayBuffer,
            );
            results.push({ success: false, error: "Invalid buffer type" });
          }
        } else {
          console.warn(`Font buffer not found for ${fontItem.name}`);
          results.push({ success: false, error: "Font buffer not found" });
        }
      } catch (error) {
        console.error(`Failed to load font ${fontItem.name}:`, error);
        results.push({
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  };
};
