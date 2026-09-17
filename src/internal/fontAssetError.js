export const createFontAssetError = (fileId, code, cause) => {
  const error = new Error(`Unable to load font ${fileId}.`, { cause });
  error.fileId = fileId;
  error.code = code;
  return error;
};

export const isFontAssetError = (error) =>
  [
    "font_integrity_mismatch",
    "font_file_unavailable",
    "font_load_failed",
    "font_load_timeout",
  ].includes(error?.code);
