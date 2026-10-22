import { describe, expect, it } from "vitest";
import {
  formatI18nCopy,
  formatPluralCopy,
  selectPluralCopy,
} from "../../src/internal/ui/i18nCopy.js";

describe("formatI18nCopy", () => {
  it("inserts values that contain replacement patterns as written", () => {
    expect(formatI18nCopy("Delete {name}?", { name: "Price $& tax $'" })).toBe(
      "Delete Price $& tax $'?",
    );
  });
});

describe("plural copy", () => {
  const copy = {
    lineCount_one: "{count} line",
    lineCount_few: "{count} few-form lines",
    lineCount_many: "{count} many-form lines",
    lineCount_other: "{count} lines",
  };

  it("picks the key for the count's plural category", () => {
    const ru = { pluralRulesLocale: "ru-RU" };

    expect(selectPluralCopy(copy, "lineCount", 1, ru)).toBe("{count} line");
    expect(selectPluralCopy(copy, "lineCount", 3, ru)).toBe(
      "{count} few-form lines",
    );
    expect(selectPluralCopy(copy, "lineCount", 11, ru)).toBe(
      "{count} many-form lines",
    );
    expect(selectPluralCopy(copy, "lineCount", 1.5, ru)).toBe("{count} lines");
  });

  it("uses English rules when no locale is given", () => {
    expect(formatPluralCopy(copy, "lineCount", 1)).toBe("1 line");
    expect(formatPluralCopy(copy, "lineCount", 3)).toBe("3 lines");
  });

  it("falls back to the other key when a category has no key", () => {
    expect(
      formatPluralCopy({ lineCount_other: "{count} lines" }, "lineCount", 1),
    ).toBe("1 lines");
  });

  it("formats with the given replacements", () => {
    expect(
      formatPluralCopy(copy, "lineCount", 1200, {
        dateTime: { pluralRulesLocale: "en-US" },
        replacements: { count: "1,200" },
      }),
    ).toBe("1,200 lines");
  });
});
