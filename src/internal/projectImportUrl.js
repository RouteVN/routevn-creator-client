const LOOPBACK_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const GOOGLE_DRIVE_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "drive.usercontent.google.com",
]);
const GOOGLE_DRIVE_DOWNLOAD_URL =
  "https://drive.usercontent.google.com/download";
const GOOGLE_DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;
const GOOGLE_DRIVE_RESOURCE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const isLoopbackHttpUrl = (url) => {
  return LOOPBACK_HTTP_HOSTS.has(url.hostname.toLowerCase());
};

export const isGoogleDriveImportUrl = (input) => {
  try {
    return GOOGLE_DRIVE_HOSTS.has(new URL(input).hostname.toLowerCase());
  } catch {
    return false;
  }
};

// File id of a Google Drive file link, or undefined when the URL is not a
// file link (other Drive and Docs pages pass through unchanged). Folder links
// cannot be downloaded as one file and are rejected.
const readGoogleDriveFileId = (url) => {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  const queryId = url.searchParams.get("id") ?? "";

  if (host === "drive.google.com") {
    if (
      segments.includes("folders") ||
      segments[0] === "folderview" ||
      segments[0] === "embeddedfolderview"
    ) {
      throw new Error(
        "unsupportedUrl: Google Drive folder links cannot be imported. Share the project as a zip file instead.",
      );
    }
    if (segments[0] === "file") {
      const dIndex = segments.indexOf("d");
      return dIndex === -1 ? "" : (segments[dIndex + 1] ?? "");
    }
    if (segments[0] === "open" || segments[0] === "uc") {
      return queryId;
    }
    return undefined;
  }

  const lastSegment = segments[segments.length - 1];
  const isDownloadPath = lastSegment === "uc" || lastSegment === "download";
  if (host === "docs.google.com") {
    return segments[0] === "uc" ? queryId : undefined;
  }
  return isDownloadPath ? queryId : undefined;
};

// Google Drive share links open a viewer page, and old download links stop at
// a virus-scan warning page for large files. Both become the direct download
// URL with `confirm=t`, which serves the file itself. Applying this to its own
// output returns the same URL.
const normalizeGoogleDriveUrl = (url) => {
  if (!GOOGLE_DRIVE_HOSTS.has(url.hostname.toLowerCase())) {
    return url.href;
  }

  const fileId = readGoogleDriveFileId(url);
  if (fileId === undefined) {
    return url.href;
  }
  if (!GOOGLE_DRIVE_ID_PATTERN.test(fileId)) {
    throw new Error("invalidUrl: Could not read the Google Drive file id.");
  }

  const downloadUrl = new URL(GOOGLE_DRIVE_DOWNLOAD_URL);
  downloadUrl.searchParams.set("id", fileId);
  downloadUrl.searchParams.set("export", "download");
  downloadUrl.searchParams.set("confirm", "t");
  const resourceKey = url.searchParams.get("resourcekey") ?? "";
  if (GOOGLE_DRIVE_RESOURCE_KEY_PATTERN.test(resourceKey)) {
    downloadUrl.searchParams.set("resourcekey", resourceKey);
  }
  return downloadUrl.href;
};

// Rule C URL checks for project archive imports. Returns the normalized URL
// string (Google Drive file links become direct download URLs), or throws an
// Error whose message starts with a stable `invalidUrl` or `unsupportedUrl`
// code for localized reporting.
export const parseProjectImportUrl = (input) => {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!trimmed) {
    throw new Error("invalidUrl: URL is required.");
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`invalidUrl: Could not parse "${trimmed}".`);
  }

  if (url.username || url.password) {
    throw new Error("invalidUrl: URLs with credentials are not allowed.");
  }

  if (url.protocol !== "https:") {
    const isLoopbackHttp = url.protocol === "http:" && isLoopbackHttpUrl(url);
    if (!isLoopbackHttp) {
      throw new Error(
        `invalidUrl: Only https URLs are allowed (http is limited to localhost).`,
      );
    }
  }

  return normalizeGoogleDriveUrl(url);
};
