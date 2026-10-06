const getFontLoadKey = (attrs = {}) => {
  const {
    fileId,
    fileIds,
    fontFamily,
    fontFamilies,
    fontWeightDescriptor,
    fontWeightDescriptors,
  } = attrs;
  const resolvedFileIds = Array.isArray(fileIds)
    ? fileIds
    : fileId && fileId !== "undefined"
      ? [fileId]
      : [];
  if (resolvedFileIds.length > 0) {
    const resolvedWeightDescriptors = Array.isArray(fontWeightDescriptors)
      ? fontWeightDescriptors
      : fontWeightDescriptor && fontWeightDescriptor !== "undefined"
        ? [fontWeightDescriptor]
        : [];
    return resolvedFileIds
      .map(
        (resolvedFileId, index) =>
          `${resolvedFileId}\u0001${resolvedWeightDescriptors[index] ?? ""}`,
      )
      .join("\u0000");
  }

  const resolvedFontFamilies = Array.isArray(fontFamilies)
    ? fontFamilies
    : fontFamily
      ? [fontFamily]
      : [];

  return resolvedFontFamilies.join("\u0000") || "sans-serif";
};

// Loads each font file on its own. When any fails, the preview shows the
// unavailable-font warning, and `font-load-error` names the files that
// failed, so a page can warn about them or draw without them.
const loadPreviewFont = async (deps, attrs = {}) => {
  const { dispatchEvent, projectService, render, store } = deps;
  const fileIds = Array.isArray(attrs.fileIds)
    ? attrs.fileIds
    : attrs.fileId && attrs.fileId !== "undefined"
      ? [attrs.fileId]
      : [];
  const fontWeightDescriptors = Array.isArray(attrs.fontWeightDescriptors)
    ? attrs.fontWeightDescriptors
    : attrs.fontWeightDescriptor && attrs.fontWeightDescriptor !== "undefined"
      ? [attrs.fontWeightDescriptor]
      : [];
  const key = getFontLoadKey(attrs);

  store.startFontLoad({ key });
  render();

  const results = await Promise.allSettled(
    fileIds.map(async (fileId, index) => {
      const result = await projectService.loadFontFile({
        fontName: fileId,
        fileId,
        fontWeightDescriptor: fontWeightDescriptors[index] || undefined,
      });
      if (result?.success === false) {
        throw new Error(result.error ?? "Unable to load preview font");
      }
    }),
  );
  const failures = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ fileId: fileIds[index], error: result.reason }]
      : [],
  );
  if (failures.length > 0) {
    store.finishFontLoad({ key, status: "error" });
    render();
    console.warn(
      `Failed to load font preview: ${failures.map(({ fileId }) => fileId).join(", ")}`,
      failures,
    );
    dispatchEvent(
      new CustomEvent("font-load-error", {
        detail: { failures },
        bubbles: true,
        composed: true,
      }),
    );
    return;
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
