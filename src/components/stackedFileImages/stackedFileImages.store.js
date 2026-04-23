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

export const selectViewData = ({ props: attrs }) => {
  const fileIds = Array.isArray(attrs.fileIds)
    ? attrs.fileIds.filter((fileId) => typeof fileId === "string" && fileId)
    : [];

  return {
    fileLayers: fileIds.map((fileId, index) => ({
      fileId,
      key: `${index}:${fileId}`,
    })),
    w: attrs.w ?? "200",
    h: attrs.h ?? "120",
    br: attrs.br ?? "sm",
    lazy: parseBooleanProp(attrs.lazy),
  };
};
