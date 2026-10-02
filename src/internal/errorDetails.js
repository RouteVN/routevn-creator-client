const MAX_CAUSES = 2;
const MAX_VALUE_LENGTH = 300;

// Errors can come from WebKit or other realms as DOMException-like objects,
// so check their shape instead of instanceof Error.
const describeErrorValue = (error) => {
  if (typeof error?.message !== "string") {
    // Tauri invoke rejects with plain objects; show their fields.
    const value =
      error !== null && typeof error === "object"
        ? JSON.stringify(error)
        : String(error);
    return value.length > MAX_VALUE_LENGTH
      ? `${value.slice(0, MAX_VALUE_LENGTH)}…`
      : value;
  }

  const message = error.message.trim();
  const name = error.name && error.name !== "Error" ? error.name : "";
  if (name && message) {
    return `${name}: ${message}`;
  }
  return name || message || "Error";
};

// The technical description of an unexpected failure for an alert: the
// error's name and message, then up to two causes.
export const describeError = (error) => {
  const lines = [describeErrorValue(error)];
  let cause = error?.cause;
  while (cause !== undefined && lines.length <= MAX_CAUSES) {
    lines.push(describeErrorValue(cause));
    cause = cause?.cause;
  }
  return lines.join("\n");
};

// Append the error's description to an explanation shown to the user. A
// missing error adds nothing.
export const withErrorDetails = (message, error, detailsLabel) =>
  error === undefined || error === null
    ? message
    : `${message}\n\n${detailsLabel}:\n${describeError(error)}`;
