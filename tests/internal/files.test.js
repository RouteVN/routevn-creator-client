import { describe, expect, it } from "vitest";
import { formatFileSize } from "../../src/internal/files.js";
import { FR_I18N } from "../support/i18n.js";

describe("files", () => {
  it("returns an empty string for missing or invalid sizes", () => {
    expect(formatFileSize(undefined)).toBe("");
    expect(formatFileSize(null)).toBe("");
    expect(formatFileSize(-1)).toBe("");
    expect(formatFileSize("not-a-number")).toBe("");
  });

  it("formats zero-byte and positive sizes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(2.45 * 1024 * 1024)).toBe("2.45 MB");
  });

  it("formats the number for the active locale and keeps the unit", () => {
    const size = 2.45 * 1024 * 1024;
    expect(formatFileSize(size, { intlLocale: "pt" })).toBe("2,45 MB");
    expect(formatFileSize(1.5 * 1024, { intlLocale: "ru" })).toBe("1,5 KB");
    expect(formatFileSize(size, { intlLocale: "ja" })).toBe("2.45 MB");
  });

  it("takes the unit from the dateTime catalog", () => {
    expect(formatFileSize(2.45 * 1024 * 1024, FR_I18N.dateTime)).toBe(
      "2,45\u00a0Mo",
    );
    expect(formatFileSize(512, FR_I18N.dateTime)).toBe("512\u00a0o");
  });

  it("stays in gigabytes from one terabyte", () => {
    expect(formatFileSize(2 * 1024 ** 4)).toBe("2,048 GB");
  });
});
