const parseBooleanProp = (value) => {
  if (value === true || value === "") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
  }

  return false;
};

const isNoBorderRadius = (value) =>
  value === "none" || value === "0" || value === 0;

export const selectViewData = ({ props: attrs }) => {
  const layers = Array.isArray(attrs.layers)
    ? attrs.layers
        .filter((layer) => typeof layer?.fileId === "string" && layer.fileId)
        .map((layer, index) => ({
          kind: layer.kind === "spritesheet" ? "spritesheet" : "image",
          fileId: layer.fileId,
          atlas: layer.atlas,
          animation: layer.animation,
          key:
            layer.previewKey ??
            `${index}:${layer.kind ?? "image"}:${layer.fileId}`,
        }))
    : undefined;
  const fileIds = Array.isArray(attrs.fileIds)
    ? attrs.fileIds.filter((fileId) => typeof fileId === "string" && fileId)
    : [];

  const brValue = attrs.br ?? "sm";
  const hasNoBorderRadius = isNoBorderRadius(brValue);
  const br = hasNoBorderRadius ? "sm" : brValue;
  const imageBr = hasNoBorderRadius ? undefined : br;
  const spritesheetBr = attrs.spritesheetBr ?? brValue;

  return {
    fileLayers:
      layers ??
      fileIds.map((fileId, index) => ({
        kind: "image",
        fileId,
        key: `${index}:image:${fileId}`,
      })),
    w: attrs.w ?? "200",
    h: attrs.h ?? "120",
    br,
    imageBr,
    containerStyle: hasNoBorderRadius
      ? "overflow: hidden; border-radius: 0;"
      : "overflow: hidden;",
    spritesheetBr,
    spritesheetCheckerCellSize: attrs.spritesheetCheckerCellSize ?? "12",
    showSpritesheetCheckerboard: attrs.showSpritesheetCheckerboard ?? true,
    lazy: parseBooleanProp(attrs.lazy),
  };
};
