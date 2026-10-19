import { withErrorDetails } from "./errorDetails.js";
import { isStorageFullError } from "./storageFullError.js";

// The technical message of the error thrown for an unsupported store. Alerts
// explain it with the `appPage` catalog instead.
export const UNSUPPORTED_PROJECT_STORE_FORMAT_MESSAGE =
  "Unsupported project store format. This RouteVN Creator build only supports the current project storage layout and will not repair older local stores automatically.";

// The messages below take `copy`, the `appPage` catalog, which both the
// Projects page and the app's project routes can read.
const withLatestCreatorVersionHint = (message, copy) =>
  `${message}\n${copy.latestCreatorVersionHint}`;

// An error without any text has nothing to show under the details label.
const getErrorWithDetails = (error) =>
  String(error?.message ?? error ?? "").trim() ? error : undefined;

export const isIncompatibleProjectOpenError = (error) => {
  if (
    error?.code === "project_projection_gap_incompatible" ||
    error?.code === "project_store_format_unsupported"
  ) {
    return true;
  }

  return (
    typeof error?.message === "string" &&
    (error.message.includes("incompatible project with version") ||
      error.message.includes("cannot project safely") ||
      error.message.includes("requires reset for schema version"))
  );
};

export const getIncompatibleProjectOpenMessage = (error, copy) => {
  if (error?.code === "project_store_format_unsupported") {
    return withLatestCreatorVersionHint(
      copy.projectOpenUnsupportedStoreFormat,
      copy,
    );
  }

  const message = typeof error?.message === "string" ? error.message : "";
  if (message.includes("requires reset for schema version")) {
    return withLatestCreatorVersionHint(
      copy.projectOpenUnsupportedVersion,
      copy,
    );
  }

  return withErrorDetails(
    withLatestCreatorVersionHint(copy.projectOpenIncompatible, copy),
    getErrorWithDetails(error),
    copy.errorDetailsLabel,
  );
};

const isMissingProjectResolutionError = (error) => {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("project resolution is required") &&
    message.includes("width") &&
    message.includes("height")
  );
};

// SQLite code 14 (SQLITE_CANTOPEN): the project folder was moved, deleted, or
// cannot be accessed. The Tauri adapter throws `project_database_missing` when
// project.db is gone; plugin-sql rejects with the SQLite message as a string.
const isProjectDatabaseOpenError = (error) => {
  if (error?.code === "project_database_missing") {
    return true;
  }

  const message = String(error?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("unable to open database file") ||
    message.includes("(code: 14)")
  );
};

// Expected environment failures: the project database cannot be opened, or the
// device or browser storage is full. Show them, but do not report them as app
// errors.
export const isProjectStorageUnavailableError = (error) =>
  isProjectDatabaseOpenError(error) || isStorageFullError(error);

const isProjectDataStructureValidationError = (error) => {
  const code = String(error?.code ?? "");
  if (code.includes("validation_failed")) {
    return true;
  }

  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("validation failed") ||
    message.includes("failed validation") ||
    message.includes("data structure")
  );
};

const isProjectHistoryIntegrityError = (error) => {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("committed event invariant violation");
};

export const getProjectOpenErrorMessage = (error, copy) => {
  if (isIncompatibleProjectOpenError(error)) {
    return getIncompatibleProjectOpenMessage(error, copy);
  }

  if (isMissingProjectResolutionError(error)) {
    return withLatestCreatorVersionHint(
      copy.projectOpenMissingResolution,
      copy,
    );
  }

  if (
    isProjectDataStructureValidationError(error) ||
    isProjectHistoryIntegrityError(error)
  ) {
    return withErrorDetails(
      copy.projectOpenHistoryInconsistent,
      getErrorWithDetails(error),
      copy.errorDetailsLabel,
    );
  }

  if (isProjectDatabaseOpenError(error)) {
    return copy.projectOpenDatabaseUnavailable;
  }

  return withErrorDetails(
    withLatestCreatorVersionHint(copy.projectOpenFailed, copy),
    getErrorWithDetails(error),
    copy.errorDetailsLabel,
  );
};
