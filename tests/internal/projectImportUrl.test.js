import { describe, expect, it } from "vitest";
import {
  getProjectImportErrorCode,
  getProjectImportErrorMessage,
} from "../../src/internal/projectImportErrors.js";
import {
  isGoogleDriveImportUrl,
  parseProjectImportUrl,
} from "../../src/internal/projectImportUrl.js";

const COPY = {
  failedImportProject: "Failed to import project.",
  invalidImportUrl: "Enter a valid https URL.",
  unsupportedImportUrl: "This link type is not supported.",
  googleDriveImportFailed: "Google Drive did not return a zip file.",
  importFileNameConflict: "Conflicting file names.",
  errorDetailsLabel: "Details:",
};

describe("parseProjectImportUrl", () => {
  it.each([
    ["https://example.com/project.zip", "https://example.com/project.zip"],
    [
      "https://example.com/projects/one.zip?version=2",
      "https://example.com/projects/one.zip?version=2",
    ],
    ["http://localhost:8080/project.zip", "http://localhost:8080/project.zip"],
    ["http://127.0.0.1/project.zip", "http://127.0.0.1/project.zip"],
    ["http://[::1]:9000/project.zip", "http://[::1]:9000/project.zip"],
    ["  https://example.com/project.zip  ", "https://example.com/project.zip"],
  ])("accepts %s", (input, expected) => {
    expect(parseProjectImportUrl(input)).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["not a url", "example.com/project.zip"],
    ["http on a public host", "http://example.com/project.zip"],
    ["http on a loopback subdomain", "http://localhost.evil.com/project.zip"],
    ["http on a loopback-suffix host", "http://127.0.0.1.evil.com/a.zip"],
    ["credentials", "https://user:pass@example.com/project.zip"],
    ["username only", "https://user@example.com/project.zip"],
    ["ftp scheme", "ftp://example.com/project.zip"],
    ["file scheme", "file:///tmp/project.zip"],
  ])("rejects %s", (_label, input) => {
    expect(() => parseProjectImportUrl(input)).toThrowError(/^invalidUrl: /);
  });

  it("rejects a non-string input", () => {
    expect(() => parseProjectImportUrl(undefined)).toThrowError(
      /^invalidUrl: /,
    );
  });
});

const DRIVE_ID = "1AbC_dEf-GhIjKlMnOpQrStUvWxYz012345";
const DRIVE_DOWNLOAD = `https://drive.usercontent.google.com/download?id=${DRIVE_ID}&export=download&confirm=t`;

describe("parseProjectImportUrl with Google Drive links", () => {
  it.each([
    [
      "share link",
      `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
    ],
    [
      "share link without a suffix",
      `https://drive.google.com/file/d/${DRIVE_ID}`,
    ],
    [
      "multi-account share link",
      `https://drive.google.com/file/u/1/d/${DRIVE_ID}/view?usp=drive_link`,
    ],
    ["open link", `https://drive.google.com/open?id=${DRIVE_ID}`],
    [
      "shared download link",
      `https://drive.google.com/uc?export=download&id=${DRIVE_ID}`,
    ],
    ["short download link", `https://drive.google.com/uc?id=${DRIVE_ID}`],
    [
      "download link with an old confirm token",
      `https://drive.google.com/uc?export=download&confirm=AbCd&id=${DRIVE_ID}`,
    ],
    [
      "docs host download link",
      `https://docs.google.com/uc?export=download&id=${DRIVE_ID}`,
    ],
    [
      "usercontent download link",
      `https://drive.usercontent.google.com/download?id=${DRIVE_ID}&export=download`,
    ],
    [
      "usercontent multi-account link",
      `https://drive.usercontent.google.com/u/0/uc?id=${DRIVE_ID}&export=download`,
    ],
    ["already normalized link", DRIVE_DOWNLOAD],
    [
      "padded share link",
      `  https://drive.google.com/file/d/${DRIVE_ID}/view  `,
    ],
  ])("turns a %s into the direct download URL", (_label, input) => {
    expect(parseProjectImportUrl(input)).toBe(DRIVE_DOWNLOAD);
  });

  it("keeps a resource key from newer share links", () => {
    expect(
      parseProjectImportUrl(
        `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing&resourcekey=0-AbC_d-1`,
      ),
    ).toBe(`${DRIVE_DOWNLOAD}&resourcekey=0-AbC_d-1`);
  });

  it("drops a malformed resource key", () => {
    expect(
      parseProjectImportUrl(
        `https://drive.google.com/uc?id=${DRIVE_ID}&resourcekey=a%20b%26c`,
      ),
    ).toBe(DRIVE_DOWNLOAD);
  });

  it.each([
    `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
    `https://drive.google.com/uc?export=download&id=${DRIVE_ID}&resourcekey=0-key`,
  ])("is idempotent for %s", (input) => {
    const once = parseProjectImportUrl(input);
    expect(parseProjectImportUrl(once)).toBe(once);
  });

  it.each([
    ["folder", `https://drive.google.com/drive/folders/${DRIVE_ID}`],
    [
      "multi-account folder",
      `https://drive.google.com/drive/u/0/folders/${DRIVE_ID}?usp=sharing`,
    ],
    ["folder view", `https://drive.google.com/folderview?id=${DRIVE_ID}`],
  ])("rejects a %s link as unsupported", (_label, input) => {
    expect(() => parseProjectImportUrl(input)).toThrowError(
      /^unsupportedUrl: /,
    );
  });

  it.each([
    ["a too-short id", "https://drive.google.com/file/d/short/view"],
    ["a missing id", "https://drive.google.com/open"],
    ["a missing file segment", "https://drive.google.com/file/d/"],
    ["an invalid id", `https://drive.google.com/uc?id=${DRIVE_ID}%2F..%2Fx`],
  ])("rejects %s", (_label, input) => {
    expect(() => parseProjectImportUrl(input)).toThrowError(/^invalidUrl: /);
  });

  it.each([
    "https://drive.google.com/",
    "https://drive.google.com/drive/my-drive",
    `https://docs.google.com/document/d/${DRIVE_ID}/edit`,
  ])("passes other Drive and Docs pages through unchanged (%s)", (input) => {
    expect(parseProjectImportUrl(input)).toBe(input);
  });

  it.each([
    `https://example.com/file/d/${DRIVE_ID}/view`,
    `https://drive.google.com.evil.example/file/d/${DRIVE_ID}/view`,
    `https://notdrive.google.com/file/d/${DRIVE_ID}/view`,
  ])("does not rewrite look-alike hosts (%s)", (input) => {
    expect(parseProjectImportUrl(input)).toBe(input);
  });

  it("still requires https for Drive hosts", () => {
    expect(() =>
      parseProjectImportUrl(`http://drive.google.com/file/d/${DRIVE_ID}/view`),
    ).toThrowError(/^invalidUrl: /);
  });

  it("recognizes Drive hosts only", () => {
    expect(isGoogleDriveImportUrl(DRIVE_DOWNLOAD)).toBe(true);
    expect(
      isGoogleDriveImportUrl(`https://drive.google.com/file/d/${DRIVE_ID}`),
    ).toBe(true);
    expect(isGoogleDriveImportUrl("https://example.com/project.zip")).toBe(
      false,
    );
    expect(isGoogleDriveImportUrl("not a url")).toBe(false);
  });
});

describe("getProjectImportErrorMessage", () => {
  it("maps a stable code to its localized message with details", () => {
    const error = new Error(
      "fileNameConflict: abc.png and abc.jpg both map to abc",
    );

    expect(getProjectImportErrorMessage(error, COPY)).toBe(
      "Conflicting file names.\n\nDetails:\nfileNameConflict: abc.png and abc.jpg both map to abc",
    );
  });

  it("falls back to the generic message for unknown codes", () => {
    const error = new Error("Something unexpected happened");

    expect(getProjectImportErrorMessage(error, COPY)).toBe(
      "Failed to import project.\n\nDetails:\nSomething unexpected happened",
    );
  });

  it("reads the code before the first colon only", () => {
    expect(getProjectImportErrorCode(new Error("invalidUrl: http://x"))).toBe(
      "invalidUrl",
    );
    expect(getProjectImportErrorCode(new Error("no code here"))).toBe("");
  });

  it("maps the unsupported link and Google Drive codes", () => {
    expect(
      getProjectImportErrorMessage(
        new Error("unsupportedUrl: folder links cannot be imported"),
        COPY,
      ),
    ).toBe(
      "This link type is not supported.\n\nDetails:\nunsupportedUrl: folder links cannot be imported",
    );
    expect(
      getProjectImportErrorMessage(
        new Error("googleDriveFailed: invalidArchive: not a zip"),
        COPY,
      ),
    ).toBe(
      "Google Drive did not return a zip file.\n\nDetails:\ngoogleDriveFailed: invalidArchive: not a zip",
    );
  });
});
