const MAX_CAUSES = 3;

// Codes from the native bridges. The iOS bridge sends `storageFull` for a file
// write that the system refused for lack of space, because the system's own
// message follows the device language. The Android bridge sends the name of the
// Java exception.
const STORAGE_FULL_CODES = new Set(["storageFull", "SQLiteFullException"]);

const STORAGE_FULL_MESSAGES = [
  // iOS file write failure (English): "You can’t save the file “x” because
  // there isn’t enough space."
  /there isn['’]t enough space/,
  // ENOSPC from POSIX systems and Android: "No space left on device".
  /no space left on device/,
  /\benospc\b/,
  // SQLITE_FULL, from SQLite itself and the SQL plugin.
  /database or disk is full/,
  // Windows: "There is not enough space on the disk."
  /not enough space on the disk/,
  // Rust keeps the error number when the system message is in another
  // language: 28 is ENOSPC, 39 and 112 are the Windows disk full errors.
  /\(os error (?:28|39|112)\)/,
];

const readProperty = (value, name) => {
  try {
    return value?.[name];
  } catch {
    return undefined;
  }
};

const describesFullStorage = (error) => {
  if (STORAGE_FULL_CODES.has(readProperty(error, "code"))) {
    return true;
  }
  // A browser refuses a write that would pass the storage quota.
  if (readProperty(error, "name") === "QuotaExceededError") {
    return true;
  }

  // Tauri rejects with strings, other realms with objects that are not Errors.
  const message = readProperty(error, "message") ?? error;
  if (typeof message !== "string") {
    return false;
  }
  const text = message.toLowerCase();
  return STORAGE_FULL_MESSAGES.some((pattern) => pattern.test(text));
};

// Whether a failed write was refused because the device, or the browser's
// storage for the app, is full. That is the user's to fix, not a bug in the
// app: tell them to free up space instead of reporting an error.
export const isStorageFullError = (error) => {
  const seen = new Set();
  let current = error;
  while (
    current !== undefined &&
    current !== null &&
    !seen.has(current) &&
    seen.size <= MAX_CAUSES
  ) {
    if (describesFullStorage(current)) {
      return true;
    }
    seen.add(current);
    current = readProperty(current, "cause");
  }
  return false;
};
