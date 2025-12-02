export const handleAfterMount = async (deps) => {
  const { attrs = {}, projectService, render } = deps;
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
      await projectService.loadFontFile({
        fontName: fontFamily,
        fileId: fileId,
      });
    } catch (error) {
      console.warn(`Failed to load font: ${fontFamily}`, error);
    }
  }

  render();
};
