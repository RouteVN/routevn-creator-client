import { withErrorDetails } from "./errorDetails.js";

// Stable codes of a store template download, or a template file, that
// failed. Each one the user can act on has its own localized projectsPage
// message; any other failure, such as a lost connection, says the download
// or reading failed, with its details.
export const PROJECT_TEMPLATE_NOT_FOUND = "project_template_not_found";
export const PROJECT_TEMPLATE_UNSUPPORTED = "project_template_unsupported";
export const PROJECT_TEMPLATE_INVALID = "project_template_invalid";
export const PROJECT_TEMPLATE_TOO_LARGE = "project_template_too_large";

const MESSAGE_COPY_KEYS = {
  [PROJECT_TEMPLATE_NOT_FOUND]: "templateNotFoundMessage",
  [PROJECT_TEMPLATE_UNSUPPORTED]: "templateNeedsNewerAppMessage",
};

// A package that downloads but does not read as a template: the store's
// checks, or the package reader's codes for a broken ZIP, a missing or
// unreadable manifest or file, or a file that fails its checksum.
const DAMAGED_CODES = [
  PROJECT_TEMPLATE_INVALID,
  "package_invalid",
  "manifest_not_found",
  "manifest_invalid_json",
  "manifest_too_large",
  "file_not_found",
  "file_too_large",
  "integrity_mismatch",
];

export const getProjectTemplateDownloadErrorMessage = (error, copy) => {
  const copyKey = MESSAGE_COPY_KEYS[error?.code];
  if (copyKey) return copy[copyKey];
  return withErrorDetails(
    copy[
      DAMAGED_CODES.includes(error?.code)
        ? "templateInvalidMessage"
        : "templateDownloadFailedMessage"
    ],
    error,
    copy.errorDetailsLabel,
  );
};

// A template file that cannot be opened: one for a newer app, one that is not
// a template or is damaged, or one that could not be read.
export const getProjectTemplateFileErrorMessage = (error, copy) => {
  if (error?.code === PROJECT_TEMPLATE_UNSUPPORTED) {
    return copy.templateNeedsNewerAppMessage;
  }
  return withErrorDetails(
    copy[
      DAMAGED_CODES.includes(error?.code)
        ? "templateFileInvalidMessage"
        : "templateFileReadFailedMessage"
    ],
    error,
    copy.errorDetailsLabel,
  );
};
