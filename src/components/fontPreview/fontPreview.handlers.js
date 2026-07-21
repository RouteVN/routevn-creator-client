const getFontLoadKey = (attrs = {}) => {
  const { fileId, fileIds, fontFamily, fontFamilies } = attrs;
  const resolvedFileIds = Array.isArray(fileIds)
    ? fileIds
    : fileId && fileId !== "undefined"
      ? [fileId]
      : [];
  if (resolvedFileIds.length > 0) {
    return resolvedFileIds.join("\u0000");
  }

  const resolvedFontFamilies = Array.isArray(fontFamilies)
    ? fontFamilies
    : fontFamily
      ? [fontFamily]
      : [];

  return resolvedFontFamilies.join("\u0000") || "sans-serif";
};

const loadPreviewFont = async (deps, attrs = {}) => {
  const { projectService, render, store } = deps;
  const fileIds = Array.isArray(attrs.fileIds)
    ? attrs.fileIds
    : attrs.fileId && attrs.fileId !== "undefined"
      ? [attrs.fileId]
      : [];
  const key = getFontLoadKey(attrs);

  store.startFontLoad({ key });
  render();

  if (fileIds.length > 0) {
    try {
      await Promise.all(
        fileIds.map(async (fileId) => {
          const result = await projectService.loadFontFile({
            fontName: fileId,
            fileId,
          });
          if (result?.success === false) {
            throw new Error("Unable to load preview font");
          }
        }),
      );
    } catch (error) {
      store.finishFontLoad({ key, status: "error" });
      render();
      console.warn(`Failed to load font preview: ${fileIds.join(", ")}`, error);
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
