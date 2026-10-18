/**
 * Format a byte count with a binary unit, such as "2.45 MB".
 * @param {number} bytes - Size in bytes
 * @param {Object} [options] - The `dateTime` catalog of the active locale
 * @param {string} [options.intlLocale] - BCP 47 tag used for number formatting
 * @returns {string} Formatted size, or an empty string for an invalid size
 */
export const formatFileSize = (bytes, { intlLocale = "en-US" } = {}) => {
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
  const value = new Intl.NumberFormat(intlLocale, {
    maximumFractionDigits: 2,
  }).format(normalizedBytes / Math.pow(k, i));
  return `${value} ${sizes[i]}`;
};
