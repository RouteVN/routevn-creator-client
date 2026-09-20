// Keep a plain-text snapshot: do not serialize project state or arbitrary error
// payloads. Native bridges may reject with a string instead of an Error.
export const formatSceneInitializationDiagnostics = ({
  error,
  progress = {},
}) => {
  const lines = [`Step: ${progress.stage ?? "unknown"}`];
  const stacks = [];
  const visited = new Set();
  let count = 0;
  const appendError = (value, label) => {
    if (count >= 8) return;
    if (value && typeof value === "object") {
      if (visited.has(value)) return;
      visited.add(value);
    }
    count += 1;
    const message =
      typeof value === "string"
        ? value
        : (value?.message ?? "No error message was provided.");
    lines.push(`${label}: ${value?.name ?? "Error"}: ${message}`);
    for (const [key, title] of [
      ["code", "Code"],
      ["operation", "Operation"],
      ["timeoutMs", "Timeout (ms)"],
      ["fileId", "File ID"],
    ]) {
      const field = value?.[key];
      if (typeof field === "string" || typeof field === "number") {
        lines.push(`${title}: ${field}`);
      }
    }
    if (typeof value?.stack === "string") stacks.push(value.stack);
    if (value?.cause !== undefined) appendError(value.cause, "Caused by");
    if (Array.isArray(value?.errors)) {
      for (const child of value.errors.slice(0, 8))
        appendError(child, "Related error");
    }
  };
  appendError(error, "Error");
  if (progress.assetName) lines.push(`Asset: ${progress.assetName}`);
  if (progress.total !== undefined) {
    lines.push(
      `Asset progress: ${progress.completed ?? 0} / ${progress.total}`,
    );
  }
  if (stacks.length) lines.push("", "Stack traces:", ...stacks);
  return lines.join("\n");
};
