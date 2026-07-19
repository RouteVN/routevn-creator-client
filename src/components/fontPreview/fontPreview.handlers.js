const getFontLoadKey = (attrs = {}) => {
  const { fileId, fontFamily } = attrs;
  if (fileId && fileId !== "undefined") {
    return fileId;
  }

  return fontFamily ?? "sans-serif";
};

const loadPreviewFont = async (deps, attrs = {}) => {
  const { projectService, render, store } = deps;
  const { fileId } = attrs;
  const key = getFontLoadKey(attrs);

  store.startFontLoad({ key });
  render();

  if (fileId && fileId !== "undefined") {
    try {
      const result = await projectService.loadFontFile({
        fontName: fileId,
        fileId,
      });
      if (result?.success === false) {
        throw new Error("Unable to load preview font");
      }
    } catch (error) {
      store.finishFontLoad({ key, status: "error" });
      render();
      console.warn(`Failed to load font preview: ${fileId}`, error);
      return;
    }
  }

  store.finishFontLoad({ key, status: "ready" });
  render();
};

export const handleAfterMount = async (deps) => {
  await loadPreviewFont(deps, deps.props ?? {});
};

export const handleOnUpdate = async (deps, changes = {}) => {
  const oldKey = getFontLoadKey(changes.oldProps);
  const newKey = getFontLoadKey(changes.newProps);

  if (oldKey !== newKey || deps.store.selectFontLoadKey() !== newKey) {
    await loadPreviewFont(deps, changes.newProps);
    return;
  }

  deps.render();
};
