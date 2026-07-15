import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_LANGUAGE,
  getProjectLanguageTextCountMode,
  normalizeProjectLanguage,
  PROJECT_LANGUAGE_TEXT_COUNT_MODES,
  PROJECT_LANGUAGES,
  PROJECT_TEXT_COUNT_MODE_CHARACTER,
  PROJECT_TEXT_COUNT_MODE_WORD,
  requireProjectLanguage,
} from "../../src/internal/projectLanguage.js";

describe("projectLanguage", () => {
  it("defines the supported project language contract", () => {
    expect(PROJECT_LANGUAGES).toEqual(["en", "ja", "zh-hans"]);
    expect(DEFAULT_PROJECT_LANGUAGE).toBe("en");
    expect(PROJECT_LANGUAGE_TEXT_COUNT_MODES).toEqual({
      en: PROJECT_TEXT_COUNT_MODE_WORD,
      ja: PROJECT_TEXT_COUNT_MODE_CHARACTER,
      "zh-hans": PROJECT_TEXT_COUNT_MODE_CHARACTER,
    });
  });

  it("selects the writing count mode from the project language", () => {
    expect(getProjectLanguageTextCountMode("en")).toBe("word");
    expect(getProjectLanguageTextCountMode("ja")).toBe("character");
    expect(getProjectLanguageTextCountMode("zh-hans")).toBe("character");
    expect(getProjectLanguageTextCountMode()).toBe("word");
  });

  it("uses English for legacy or unsupported stored values", () => {
    expect(normalizeProjectLanguage()).toBe("en");
    expect(normalizeProjectLanguage("unsupported")).toBe("en");
  });

  it("requires new projects to use a supported language", () => {
    expect(requireProjectLanguage("ja")).toBe("ja");
    expect(() => requireProjectLanguage()).toThrow(
      "Unsupported project language.",
    );
  });
});
