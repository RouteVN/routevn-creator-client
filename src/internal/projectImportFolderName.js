// Names the folder an imported project is stored in on desktop. The name comes
// from the downloaded file: the server's Content-Disposition filename, else the
// last segment of the final URL, without its extension.

export const DEFAULT_IMPORT_FOLDER_NAME = "RouteVN Project";

const MAX_FOLDER_NAME_BYTES = 180;
const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
]);
const textEncoder = new TextEncoder();

// Characters no desktop file system accepts in a name, plus control characters.
const UNSAFE_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// `filename*=UTF-8''My%20Project.zip` wins over `filename="My Project.zip"`.
const readContentDispositionFileName = (header) => {
  let plainName;
  for (const part of header.split(";").map((item) => item.trim())) {
    const lower = part.toLowerCase();
    if (lower.startsWith("filename*=")) {
      const encoded = part.slice("filename*=".length).split("'").at(-1);
      const name = safeDecode(encoded ?? "");
      if (name) {
        return name;
      }
    } else if (lower.startsWith("filename=") && plainName === undefined) {
      plainName = part.slice("filename=".length).replace(/^"|"$/g, "");
    }
  }
  return plainName || undefined;
};

const readUrlFileName = (finalUrl) => {
  try {
    const segment = new URL(finalUrl).pathname
      .split("/")
      .filter(Boolean)
      .at(-1);
    return segment === undefined ? undefined : safeDecode(segment);
  } catch {
    return undefined;
  }
};

const stripExtension = (name) => {
  if (name.toLowerCase().endsWith(".zip")) {
    return name.slice(0, -4);
  }
  return name.replace(/\.[^./]+$/, "");
};

const truncateToBytes = (value, maxBytes) => {
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = textEncoder.encode(character).length;
    if (bytes + characterBytes > maxBytes) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }
  return result;
};

// A name that is safe as a folder name on macOS, Windows and Linux: unsafe
// characters become `-`, leading and trailing spaces and dots go, the name is
// limited to 180 bytes, and a Windows device name such as `CON` gets a `_`.
// Non-Latin names are kept.
export const sanitizeFolderName = (
  rawName,
  fallback = DEFAULT_IMPORT_FOLDER_NAME,
) => {
  const trimmed = truncateToBytes(
    rawName.replace(UNSAFE_CHARACTERS, "-").replace(/^[ .]+|[ .]+$/g, ""),
    MAX_FOLDER_NAME_BYTES,
  ).replace(/[ .]+$/, "");
  if (!trimmed) {
    return fallback;
  }
  const stem = trimmed.split(".")[0].toUpperCase();
  return WINDOWS_RESERVED_NAMES.has(stem) ? `_${trimmed}` : trimmed;
};

export const deriveImportFolderName = ({ contentDisposition, finalUrl }) => {
  const fileName =
    (contentDisposition
      ? readContentDispositionFileName(contentDisposition)
      : undefined) ?? (finalUrl ? readUrlFileName(finalUrl) : undefined);
  if (!fileName) {
    return DEFAULT_IMPORT_FOLDER_NAME;
  }
  return sanitizeFolderName(stripExtension(fileName));
};
