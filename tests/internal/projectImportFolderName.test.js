import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMPORT_FOLDER_NAME,
  deriveImportFolderName,
  sanitizeFolderName,
} from "../../src/internal/projectImportFolderName.js";

describe("deriveImportFolderName", () => {
  it.each([
    [
      "the Content-Disposition filename without .zip",
      {
        contentDisposition: 'attachment; filename="Project One.zip"',
        finalUrl: "https://example.com/download?id=1",
      },
      "Project One",
    ],
    [
      "the encoded filename over the plain one",
      {
        contentDisposition:
          "attachment; filename=\"fallback.zip\"; filename*=UTF-8''%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88.zip",
        finalUrl: "https://example.com/a",
      },
      "プロジェクト",
    ],
    [
      "the last URL segment",
      { finalUrl: "https://example.com/files/My%20Project.ZIP?token=1" },
      "My Project",
    ],
    [
      "a non-zip name without its last extension",
      { finalUrl: "https://example.com/p.tar.gz" },
      "p.tar",
    ],
    [
      "a sanitized name",
      { contentDisposition: 'attachment; filename="a:b/c.zip"' },
      "a-b-c",
    ],
    ["the default without a name", {}, DEFAULT_IMPORT_FOLDER_NAME],
    [
      "the default for a URL without a file name",
      { finalUrl: "https://example.com/" },
      DEFAULT_IMPORT_FOLDER_NAME,
    ],
  ])("uses %s", (_label, source, expected) => {
    expect(deriveImportFolderName(source)).toBe(expected);
  });
});

describe("sanitizeFolderName", () => {
  it.each([
    ['a<b>c:d"e/f\\g|h?i*j', "a-b-c-d-e-f-g-h-i-j"],
    ["a\u0001b", "a-b"],
    ["  ..Project One.. ", "Project One"],
    ["日本語のプロジェクト", "日本語のプロジェクト"],
    [" .. ", DEFAULT_IMPORT_FOLDER_NAME],
    ["CON", "_CON"],
    ["lpt9", "_lpt9"],
    ["AUX.txt", "_AUX.txt"],
    ["CONSOLE", "CONSOLE"],
    ["COM10", "COM10"],
    // At most 180 bytes, never cutting a character in half or leaving a
    // trailing dot or space.
    ["あ".repeat(100), "あ".repeat(60)],
    [`${"a".repeat(179)}. b`, "a".repeat(179)],
  ])("turns %j into %j", (name, expected) => {
    expect(sanitizeFolderName(name)).toBe(expected);
  });
});
