import { describe, expect, it } from "vitest";
import { parseProjectImportUrl } from "../../src/internal/projectImportUrl.js";

const DRIVE_ID = "1AbC_dEf-GhIjKlMnOpQrStUvWxYz012345";
const DRIVE_DOWNLOAD = `https://drive.usercontent.google.com/download?id=${DRIVE_ID}&export=download&confirm=t`;

describe("parseProjectImportUrl", () => {
  it.each([
    [
      "https://example.com/projects/one.zip?version=2",
      "https://example.com/projects/one.zip?version=2",
    ],
    ["  https://example.com/project.zip  ", "https://example.com/project.zip"],
    ["http://localhost:8080/project.zip", "http://localhost:8080/project.zip"],
    ["http://[::1]:9000/project.zip", "http://[::1]:9000/project.zip"],
  ])("accepts %s", (input, expected) => {
    expect(parseProjectImportUrl(input)).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["missing", undefined],
    ["not a url", "example.com/project.zip"],
    ["http on a public host", "http://example.com/project.zip"],
    ["http on a loopback-suffix host", "http://127.0.0.1.evil.com/a.zip"],
    ["credentials", "https://user:pass@example.com/project.zip"],
    ["ftp scheme", "ftp://example.com/project.zip"],
    ["http Drive host", `http://drive.google.com/file/d/${DRIVE_ID}/view`],
    ["a too-short Drive id", "https://drive.google.com/file/d/short/view"],
    [
      "an invalid Drive id",
      `https://drive.google.com/uc?id=${DRIVE_ID}%2F..%2Fx`,
    ],
  ])("rejects %s", (_label, input) => {
    expect(() => parseProjectImportUrl(input)).toThrowError(/^invalidUrl: /);
  });
});

describe("parseProjectImportUrl with Google Drive links", () => {
  it.each([
    [
      "share link",
      `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`,
    ],
    [
      "multi-account share link",
      `https://drive.google.com/file/u/1/d/${DRIVE_ID}/view?usp=drive_link`,
    ],
    ["open link", `https://drive.google.com/open?id=${DRIVE_ID}`],
    [
      "download link with an old confirm token",
      `https://drive.google.com/uc?export=download&confirm=AbCd&id=${DRIVE_ID}`,
    ],
    [
      "docs host download link",
      `https://docs.google.com/uc?export=download&id=${DRIVE_ID}`,
    ],
    ["already normalized link", DRIVE_DOWNLOAD],
  ])("turns a %s into the direct download URL", (_label, input) => {
    expect(parseProjectImportUrl(input)).toBe(DRIVE_DOWNLOAD);
  });

  it("keeps a resource key from newer share links, and is idempotent", () => {
    const once = parseProjectImportUrl(
      `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing&resourcekey=0-AbC_d-1`,
    );

    expect(once).toBe(`${DRIVE_DOWNLOAD}&resourcekey=0-AbC_d-1`);
    expect(parseProjectImportUrl(once)).toBe(once);
  });

  it.each([
    `https://drive.google.com/drive/folders/${DRIVE_ID}`,
    `https://drive.google.com/folderview?id=${DRIVE_ID}`,
  ])("rejects the folder link %s as unsupported", (input) => {
    expect(() => parseProjectImportUrl(input)).toThrowError(
      /^unsupportedUrl: /,
    );
  });

  it.each([
    "https://drive.google.com/drive/my-drive",
    `https://docs.google.com/document/d/${DRIVE_ID}/edit`,
    `https://drive.google.com.evil.example/file/d/${DRIVE_ID}/view`,
    `https://notdrive.google.com/file/d/${DRIVE_ID}/view`,
  ])(
    "passes other pages and look-alike hosts through unchanged (%s)",
    (input) => {
      expect(parseProjectImportUrl(input)).toBe(input);
    },
  );
});
