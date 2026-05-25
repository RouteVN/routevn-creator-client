export const IMPORT_PACK_SCHEMA = "routevn.import-pack.v1";
export const IMPORT_FOLDER_ROOT_VALUE = "_root";

const IMPORT_PACKAGE_VALIDATION_ERROR_NAME = "ImportPackageValidationError";

export const createImportPackageValidationError = (message) => {
  const error = new Error(message);
  error.name = IMPORT_PACKAGE_VALIDATION_ERROR_NAME;
  return error;
};

export const isImportPackageValidationError = (error) => {
  return error?.name === IMPORT_PACKAGE_VALIDATION_ERROR_NAME;
};

export const isPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

export const isValidHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isJsonLikeContentType = (contentType = "") => {
  const normalized = contentType.toLowerCase();
  return (
    !normalized ||
    normalized.includes("json") ||
    normalized.startsWith("text/plain")
  );
};

export const validateImportPackageObject = (input) => {
  if (!isPlainObject(input)) {
    throw createImportPackageValidationError(
      "Import package must be a JSON object.",
    );
  }

  if (input.schema !== undefined && input.schema !== IMPORT_PACK_SCHEMA) {
    throw createImportPackageValidationError(
      "Unsupported import package schema.",
    );
  }

  if (input.schema === IMPORT_PACK_SCHEMA && !isPlainObject(input.repository)) {
    throw createImportPackageValidationError(
      "Import package repository is missing.",
    );
  }

  return input;
};

export const fetchImportPackageJson = async ({ url } = {}) => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw createImportPackageValidationError("Package could not be loaded.");
  }

  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!isJsonLikeContentType(contentType)) {
    throw createImportPackageValidationError("Import URL must return JSON.");
  }

  let input;
  try {
    input = await response.json();
  } catch {
    throw createImportPackageValidationError(
      "Import URL did not return valid JSON.",
    );
  }

  return validateImportPackageObject(input);
};

export const getImportFileRecords = (importInput) => {
  if (isPlainObject(importInput?.files)) {
    return importInput.files;
  }

  if (isPlainObject(importInput?.repository?.files?.items)) {
    return importInput.repository.files.items;
  }

  return {};
};

export const getImportFileDescriptor = (importInput, fileId) => {
  if (!fileId) {
    return undefined;
  }

  return getImportFileRecords(importInput)[fileId];
};

export const getImportFileUrl = (fileDescriptor = {}) => {
  return fileDescriptor.url ?? fileDescriptor.source?.url;
};

export const validateImportFileDescriptor = ({
  importInput,
  fileId,
  label = "File dependency",
} = {}) => {
  if (!fileId) {
    throw createImportPackageValidationError(`${label} is missing a file id.`);
  }

  const fileDescriptor = getImportFileDescriptor(importInput, fileId);
  if (!isPlainObject(fileDescriptor)) {
    throw createImportPackageValidationError(
      `${label} is missing a file record.`,
    );
  }

  const fileUrl = getImportFileUrl(fileDescriptor);
  if (!fileUrl) {
    throw createImportPackageValidationError(`${label} is missing a file URL.`);
  }

  if (!isValidHttpUrl(fileUrl)) {
    throw createImportPackageValidationError(
      `${label} has an invalid file URL.`,
    );
  }

  return fileDescriptor;
};

export const normalizeImportParentId = (folderId) => {
  return !folderId || folderId === IMPORT_FOLDER_ROOT_VALUE
    ? undefined
    : folderId;
};

export const getFileNameFromUrl = (url) => {
  try {
    const parsedUrl = new URL(url);
    const fileName = parsedUrl.pathname.split("/").filter(Boolean).pop();
    return fileName || "imported-file";
  } catch {
    return "imported-file";
  }
};

export const createImportFile = ({ blob, fileName, mimeType }) => {
  if (typeof File === "function") {
    return new File([blob], fileName, {
      type: mimeType,
    });
  }

  blob.name = fileName;
  return blob;
};

export const downloadImportFile = async (fileDescriptor = {}) => {
  const fileUrl = getImportFileUrl(fileDescriptor);
  if (!fileUrl) {
    throw new Error("Import file URL is missing");
  }

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error("Import file could not be downloaded");
  }

  const blob = await response.blob();
  const mimeType = fileDescriptor.mimeType ?? blob.type;
  return createImportFile({
    blob,
    fileName: fileDescriptor.name ?? getFileNameFromUrl(fileUrl),
    mimeType,
  });
};
