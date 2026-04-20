export const formatFileSize = (bytes) => {
  if (bytes === undefined || bytes === null) {
    return "";
  }

  const normalizedBytes = Number(bytes);

  if (!Number.isFinite(normalizedBytes) || normalizedBytes < 0) {
    return "";
  }

  if (normalizedBytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(normalizedBytes) / Math.log(k));
  return (
    Math.round((normalizedBytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
  );
};
