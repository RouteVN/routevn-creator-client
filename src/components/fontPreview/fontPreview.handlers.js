export const handleAfterMount = async (deps) => {
  const { props: attrs = {}, projectService, render, store } = deps;
  const { fontFamily, fileId } = attrs;

  store.setStatus({ status: "loading" });
  render();

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
      store.setStatus({ status: "error" });
      render();
      console.warn(`Failed to load font: ${fontFamily}`, error);
      return;
    }
  }

  store.setStatus({ status: "ready" });
  render();
};
