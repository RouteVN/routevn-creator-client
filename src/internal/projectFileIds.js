const PROJECT_FILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_PROJECT_FILE_ID_LENGTH = 128;

const normalizeProjectFileId = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

export const isSafeProjectFileId = (value) => {
  const fileId = normalizeProjectFileId(value);

  return (
    fileId.length > 0 &&
    fileId.length <= MAX_PROJECT_FILE_ID_LENGTH &&
    PROJECT_FILE_ID_PATTERN.test(fileId)
  );
};

export const assertSafeProjectFileId = (
  value,
  { label = "Project file id" } = {},
) => {
  const fileId = normalizeProjectFileId(value);

  if (!isSafeProjectFileId(fileId)) {
    throw new Error(`${label} is invalid.`);
  }

  return fileId;
};
