import { withErrorDetails } from "./errorDetails.js";

// Stable error codes from the native import contract. Each maps to a
// localized projectsPage copy key; unknown codes fall back to the generic
// import failure message.
const IMPORT_ERROR_COPY_KEYS = {
  invalidUrl: "invalidImportUrl",
  unsupportedUrl: "unsupportedImportUrl",
  googleDriveFailed: "googleDriveImportFailed",
  downloadFailed: "failedImportDownload",
  archiveTooLarge: "importArchiveTooLarge",
  invalidArchive: "invalidImportArchive",
  unsafeArchiveEntry: "unsafeImportArchiveEntry",
  invalidFileName: "invalidImportFileName",
  fileNameConflict: "importFileNameConflict",
  projectExists: "importProjectExists",
  importFailed: "failedImportProject",
};

export const getProjectImportErrorCode = (error) => {
  const message = String(error?.message ?? error ?? "");
  const separatorIndex = message.indexOf(":");
  const code =
    separatorIndex === -1 ? message : message.slice(0, separatorIndex);
  return Object.hasOwn(IMPORT_ERROR_COPY_KEYS, code) ? code : "";
};

// Localized message for a project import failure: the stable code selects the
// message, and the technical detail from the error is appended under the
// localized details label.
export const getProjectImportErrorMessage = (error, copy = {}) => {
  const code = getProjectImportErrorCode(error);
  const copyKey = code ? IMPORT_ERROR_COPY_KEYS[code] : "failedImportProject";
  const baseMessage = copy[copyKey] ?? copy.failedImportProject ?? "";
  return withErrorDetails(baseMessage, error, copy.errorDetailsLabel ?? "");
};
