const FILE_SIZE_UNITS = [
  ["fileSizeBytes", "{value} B"],
  ["fileSizeKilobytes", "{value} KB"],
  ["fileSizeMegabytes", "{value} MB"],
  ["fileSizeGigabytes", "{value} GB"],
];

/**
 * Format a byte count with a binary unit, such as "2.45 MB".
 * @param {number} bytes - Size in bytes
 * @param {Object} [dateTime] - The `dateTime` catalog of the active locale,
 *   with `intlLocale` for the number and `fileSizeBytes` through
 *   `fileSizeGigabytes` templates for the unit
 * @returns {string} Formatted size, or an empty string for an invalid size
 */
export const formatFileSize = (bytes, dateTime = {}) => {
  if (bytes === undefined || bytes === null) {
    return "";
  }

  const normalizedBytes = Number(bytes);

  if (!Number.isFinite(normalizedBytes) || normalizedBytes < 0) {
    return "";
  }

  const k = 1024;
  const i =
    normalizedBytes === 0
      ? 0
      : Math.min(
          Math.floor(Math.log(normalizedBytes) / Math.log(k)),
          FILE_SIZE_UNITS.length - 1,
        );
  const [templateKey, defaultTemplate] = FILE_SIZE_UNITS[i];
  const value = new Intl.NumberFormat(dateTime.intlLocale ?? "en-US", {
    maximumFractionDigits: 2,
  }).format(normalizedBytes / Math.pow(k, i));
  return (dateTime[templateKey] ?? defaultTemplate).replaceAll(
    "{value}",
    () => value,
  );
};

/**
 * The name of a file without its extension, for the resource made from it.
 * macOS can report names in decomposed Unicode (NFD), where "한" is three
 * jamo and "é" is "e" plus an accent. The name is composed (NFC), so it
 * matches typed search text and sorts with the other names.
 * @param {string} fileName - File name, such as "배경.png"
 * @param {RegExp} [extensionPattern] - The extension to remove
 * @returns {string} The composed name without the extension
 */
export const nameFromFileName = (fileName, extensionPattern = /\.[^.]+$/) =>
  fileName.normalize("NFC").replace(extensionPattern, "");
