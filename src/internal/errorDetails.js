const MAX_CAUSES = 2;
const MAX_LINE_LENGTH = 300;

// A media or audio start was refused because it did not run inside a user
// gesture. The cure is a tap, not a report.
export const isMediaActivationRequired = (error) =>
  error?.name === "NotAllowedError";

const stringifyValue = (value) => {
  if (value !== null && typeof value === "object") {
    try {
      // Tauri invoke rejects with plain objects; show their fields.
      const json = JSON.stringify(value);
      if (json !== undefined) return json;
    } catch {}
  }
  return String(value);
};

// Errors can come from WebKit or other realms as DOMException-like objects,
// so check their shape instead of instanceof Error.
const describeErrorValue = (error) => {
  if (typeof error?.message !== "string") return stringifyValue(error);

  const message = error.message;
  const name = error.name && error.name !== "Error" ? error.name : "";
  if (name && message.trim()) {
    return `${name}: ${message}`;
  }
  return name || message || "Error";
};

// Describing an error must never throw: it runs inside error handlers, and
// the value can be anything, including a proxy or an object whose getters
// or conversions throw. Keep each line short so the alert stays readable.
const describeLine = (error) => {
  let text;
  try {
    text = describeErrorValue(error).replace(/\s+/g, " ").trim();
  } catch {
    return "Unknown error";
  }
  if (!text) return "Error";
  return text.length > MAX_LINE_LENGTH
    ? `${text.slice(0, MAX_LINE_LENGTH)}…`
    : text;
};

const readCause = (error) => {
  try {
    return error?.cause;
  } catch {
    return undefined;
  }
};

// The technical description of an unexpected failure for an alert: the
// error's name and message, then up to two distinct causes.
export const describeError = (error) => {
  const seen = new Set([error]);
  const lines = [describeLine(error)];
  let cause = readCause(error);
  while (
    cause !== undefined &&
    cause !== null &&
    !seen.has(cause) &&
    lines.length <= MAX_CAUSES
  ) {
    seen.add(cause);
    lines.push(describeLine(cause));
    cause = readCause(cause);
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
