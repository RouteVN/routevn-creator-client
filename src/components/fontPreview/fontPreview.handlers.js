export const handleAfterMount = async (deps) => {
  const { attrs = {}, fileManagerFactory, render, repositoryFactory, router } = deps;
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
      const { p: projectId } = router.getPayload();
      const fileManager = await fileManagerFactory.getByProject(projectId);

      await fileManager.loadFontFile({
        fontName: fontFamily,
        fileId: fileId,
      });
    } catch (error) {
      console.warn(`Failed to load font: ${fontFamily}`, error);
    }
  }

  render();
};