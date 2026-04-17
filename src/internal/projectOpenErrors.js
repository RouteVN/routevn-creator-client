export const UNSUPPORTED_PROJECT_STORE_FORMAT_MESSAGE =
  "Unsupported project store format. This RouteVN Creator build only supports the current project storage layout and will not repair older local stores automatically.";

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
    return UNSUPPORTED_PROJECT_STORE_FORMAT_MESSAGE;
  }

  const message = error?.message ?? "";
  if (message.includes("requires reset for schema version")) {
    return "Unsupported project version. Make sure the project was created with RouteVN Creator v1 or later. Contact RouteVN for support on migrating the old project.";
  }

  return message;
};

const isMissingProjectResolutionError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("project resolution is required") &&
    message.includes("width") &&
    message.includes("height")
  );
};

const isProjectDatabaseOpenError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("unable to open database file") ||
    message.includes("(code: 14)")
  );
};

export const getProjectOpenErrorMessage = (error) => {
  if (isIncompatibleProjectOpenError(error)) {
    return getIncompatibleProjectOpenMessage(error);
  }

  if (isMissingProjectResolutionError(error)) {
    return "Project is missing required resolution settings.";
  }

  if (isProjectDatabaseOpenError(error)) {
    return "Failed to open the project database. Make sure the project folder still exists and RouteVN can access it.";
  }

  const detail = typeof error?.message === "string" ? error.message.trim() : "";
  if (!detail || detail === "Failed to open project.") {
    return "Failed to open project. An unexpected error occurred while preparing the project.";
  }

  if (detail.toLowerCase().startsWith("failed to open project")) {
    return detail;
  }

  return `Failed to open project. ${detail}`;
};
