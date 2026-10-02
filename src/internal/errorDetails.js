const MAX_CAUSES = 2;
const MAX_VALUE_LENGTH = 300;

// Describing an error must never throw: it runs inside error handlers.
const stringifyValue = (value) => {
  if (value === null || typeof value !== "object") {
    return String(value);
  }
  try {
    // Tauri invoke rejects with plain objects; show their fields.
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

// Errors can come from WebKit or other realms as DOMException-like objects,
// so check their shape instead of instanceof Error.
const describeErrorValue = (error) => {
  if (typeof error?.message !== "string") {
    const value = stringifyValue(error);
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
// error's name and message, then up to two distinct causes.
export const describeError = (error) => {
  const seen = new Set([error]);
  const lines = [describeErrorValue(error)];
  let cause = error?.cause;
  while (
    cause !== undefined &&
    cause !== null &&
    !seen.has(cause) &&
    lines.length <= MAX_CAUSES
  ) {
    seen.add(cause);
    lines.push(describeErrorValue(cause));
    cause = cause.cause;
  }
  return lines.join("\n");
};

// Append the error's description to an explanation shown to the user, under
// a localized label that includes its punctuation. A missing error adds
// nothing.
export const withErrorDetails = (message, error, detailsLabel) =>
  error === undefined || error === null
    ? message
    : `${message}\n\n${detailsLabel}\n${describeError(error)}`;
