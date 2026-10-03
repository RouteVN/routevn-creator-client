import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMPORT_FOLDER_NAME,
  deriveImportFolderName,
  sanitizeFolderName,
} from "../../src/internal/projectImportFolderName.js";

describe("deriveImportFolderName", () => {
  it("uses the Content-Disposition filename without .zip", () => {
    expect(
      deriveImportFolderName({
        contentDisposition: 'attachment; filename="Project One.zip"',
        finalUrl: "https://example.com/download?id=1",
      }),
    ).toBe("Project One");
  });

  it("prefers the encoded filename over the plain one", () => {
    expect(
      deriveImportFolderName({
        contentDisposition:
          "attachment; filename=\"fallback.zip\"; filename*=UTF-8''%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88.zip",
        finalUrl: "https://example.com/a",
      }),
    ).toBe("プロジェクト");
  });

  it("falls back to the last URL segment", () => {
    expect(
      deriveImportFolderName({
        finalUrl: "https://example.com/files/My%20Project.ZIP?token=1",
      }),
    ).toBe("My Project");
  });

  it("strips another extension from a non-zip name", () => {
    expect(
      deriveImportFolderName({ finalUrl: "https://example.com/p.tar.gz" }),
    ).toBe("p.tar");
  });

  it("uses the default name when nothing names the file", () => {
    expect(deriveImportFolderName({})).toBe(DEFAULT_IMPORT_FOLDER_NAME);
    expect(deriveImportFolderName({ finalUrl: "https://example.com/" })).toBe(
      DEFAULT_IMPORT_FOLDER_NAME,
    );
    expect(deriveImportFolderName({ finalUrl: "not a url" })).toBe(
      DEFAULT_IMPORT_FOLDER_NAME,
    );
  });

  it("sanitizes the name it finds", () => {
    expect(
      deriveImportFolderName({
        contentDisposition: 'attachment; filename="a:b/c.zip"',
      }),
    ).toBe("a-b-c");
  });
});

describe("sanitizeFolderName", () => {
  it("replaces characters no file system accepts", () => {
    expect(sanitizeFolderName('a<b>c:d"e/f\\g|h?i*j')).toBe(
      "a-b-c-d-e-f-g-h-i-j",
    );
    expect(sanitizeFolderName("a\u0001b")).toBe("a-b");
  });

  it("trims spaces and dots at both ends", () => {
    expect(sanitizeFolderName("  ..Project One.. ")).toBe("Project One");
  });

  it("keeps non-Latin names", () => {
    expect(sanitizeFolderName("日本語のプロジェクト")).toBe(
      "日本語のプロジェクト",
    );
  });

  it("falls back when nothing is left", () => {
    expect(sanitizeFolderName(" .. ")).toBe(DEFAULT_IMPORT_FOLDER_NAME);
    expect(sanitizeFolderName("", "Untitled")).toBe("Untitled");
  });

  it.each(["CON", "con", "NUL", "COM1", "lpt9", "AUX.txt"])(
    "prefixes the Windows device name %s",
    (name) => {
      expect(sanitizeFolderName(name)).toBe(`_${name}`);
    },
  );

  it("does not prefix names that only start like a device name", () => {
    expect(sanitizeFolderName("CONSOLE")).toBe("CONSOLE");
    expect(sanitizeFolderName("COM10")).toBe("COM10");
  });

  it("limits the name to 180 bytes without cutting a character in half", () => {
    const name = sanitizeFolderName("あ".repeat(100));

    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(180);
    expect(name).toBe("あ".repeat(60));
  });

  it("does not leave a trailing dot or space after truncating", () => {
    const name = sanitizeFolderName(`${"a".repeat(179)}. b`);

    expect(name).toBe("a".repeat(179));
  });
});
