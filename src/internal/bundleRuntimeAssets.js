import { normalizeFontFileType } from "./fileTypes.js";

const isGenericBundleMimeType = (mimeType) => {
  return (
    typeof mimeType !== "string" ||
    mimeType.length === 0 ||
    mimeType === "application/octet-stream"
  );
};

const isFontMimeType = (mimeType) => {
  return (
    typeof mimeType === "string" &&
    (mimeType.startsWith("font/") ||
      mimeType.startsWith("application/font") ||
      mimeType.startsWith("application/x-font"))
  );
};

const normalizeSpecificBundleMimeType = (mimeType) => {
  if (isGenericBundleMimeType(mimeType)) {
    return undefined;
  }

  if (isFontMimeType(mimeType)) {
    return normalizeFontFileType({ fileType: mimeType }) || undefined;
  }

  return mimeType;
};

export const normalizeExportFileMimeType = ({ mimeType, assetType } = {}) => {
  if (typeof mimeType !== "string" || mimeType.length === 0) {
    return undefined;
  }

  if (assetType === "font" || isFontMimeType(mimeType)) {
    return normalizeFontFileType({ fileType: mimeType }) || undefined;
  }

  return mimeType;
};

export const resolveBundleAssetMimeType = ({
  bundleMime,
  detectedMime,
} = {}) => {
  const normalizedBundleMime = normalizeSpecificBundleMimeType(bundleMime);
  if (normalizedBundleMime) {
    return normalizedBundleMime;
  }

  if (typeof detectedMime === "string" && detectedMime.length > 0) {
    return detectedMime;
  }

  return isFontMimeType(bundleMime)
    ? "application/octet-stream"
    : bundleMime || "application/octet-stream";
};
