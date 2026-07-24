export const UNSUPPORTED_PROJECT_STORE_FORMAT_MESSAGE =
  "Unsupported project store format. This RouteVN Creator build only supports the current project storage layout and will not repair older local stores automatically.";

const LATEST_CREATOR_VERSION_HINT =
  "Make sure you're using the latest version of RouteVN Creator.";

const hasLatestCreatorVersionHint = (message) => {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("latest version of routevn creator") ||
    normalizedMessage.includes("update routevn creator")
  );
};

const withLatestCreatorVersionHint = (message) => {
  const detail = message.trim();
  if (hasLatestCreatorVersionHint(detail)) {
    return detail;
  }

  const separator = /[.!?]$/.test(detail) ? "\n" : ".\n";
  return `${detail}${separator}${LATEST_CREATOR_VERSION_HINT}`;
};

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

export const getIncompatibleProjectOpenMessage = (error) => {
  if (error?.code === "project_store_format_unsupported") {
    return withLatestCreatorVersionHint(
      UNSUPPORTED_PROJECT_STORE_FORMAT_MESSAGE,
    );
  }

  const message =
    typeof error?.message === "string" ? error.message.trim() : "";
  if (message.includes("requires reset for schema version")) {
    return withLatestCreatorVersionHint(
      "Unsupported project version. Make sure the project was created with RouteVN Creator v1 or later. Contact RouteVN for support on migrating the old project.",
    );
  }

  return withLatestCreatorVersionHint(message || "Incompatible project.");
};

const isMissingProjectResolutionError = (error) => {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("project resolution is required") &&
    message.includes("width") &&
    message.includes("height")
  );
};

const isProjectDatabaseOpenError = (error) => {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("unable to open database file") ||
    message.includes("(code: 14)")
  );
};

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

const getProjectIntegrityErrorMessage = (error) => {
  const detail =
    typeof error?.message === "string" && error.message.trim()
      ? error.message.trim()
      : "";
  const technicalDetail = detail ? `\n\nTechnical details: ${detail}` : "";
  return `RouteVN Creator couldn't safely open this project because its saved project history is inconsistent.\n\nPlease make sure you're using the latest version of RouteVN Creator. If the problem continues, please reach out to RouteVN for support.${technicalDetail}`;
};

export const getProjectOpenErrorMessage = (error) => {
  if (isIncompatibleProjectOpenError(error)) {
    return getIncompatibleProjectOpenMessage(error);
  }

  if (isMissingProjectResolutionError(error)) {
    return withLatestCreatorVersionHint(
      "Project is missing required resolution settings.",
    );
  }

  if (
    isProjectDataStructureValidationError(error) ||
    isProjectHistoryIntegrityError(error)
  ) {
    return getProjectIntegrityErrorMessage(error);
  }

  if (isProjectDatabaseOpenError(error)) {
    return "Failed to open the project database. Make sure the project folder still exists and RouteVN can access it.";
  }

  const detail = typeof error?.message === "string" ? error.message.trim() : "";
  if (!detail || detail === "Failed to open project.") {
    return withLatestCreatorVersionHint(
      "Failed to open project. An unexpected error occurred while preparing the project.",
    );
  }

  if (detail.toLowerCase().startsWith("failed to open project")) {
    return withLatestCreatorVersionHint(detail);
  }

  return withLatestCreatorVersionHint(`Failed to open project. ${detail}`);
};
