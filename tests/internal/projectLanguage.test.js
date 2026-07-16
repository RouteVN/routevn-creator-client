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
    expect(PROJECT_LANGUAGES).toEqual([
      "en",
      "ja",
      "ko",
      "zh-hans",
      "zh-hant",
      "ru",
      "it",
      "de",
      "fr",
      "es",
      "nl",
      "th",
      "ms",
      "id",
      "pt",
    ]);
    expect(DEFAULT_PROJECT_LANGUAGE).toBe("en");
    expect(PROJECT_LANGUAGE_TEXT_COUNT_MODES).toEqual({
      en: PROJECT_TEXT_COUNT_MODE_WORD,
      ja: PROJECT_TEXT_COUNT_MODE_CHARACTER,
      ko: PROJECT_TEXT_COUNT_MODE_WORD,
      "zh-hans": PROJECT_TEXT_COUNT_MODE_CHARACTER,
      "zh-hant": PROJECT_TEXT_COUNT_MODE_CHARACTER,
      ru: PROJECT_TEXT_COUNT_MODE_WORD,
      it: PROJECT_TEXT_COUNT_MODE_WORD,
      de: PROJECT_TEXT_COUNT_MODE_WORD,
      fr: PROJECT_TEXT_COUNT_MODE_WORD,
      es: PROJECT_TEXT_COUNT_MODE_WORD,
      nl: PROJECT_TEXT_COUNT_MODE_WORD,
      th: PROJECT_TEXT_COUNT_MODE_WORD,
      ms: PROJECT_TEXT_COUNT_MODE_WORD,
      id: PROJECT_TEXT_COUNT_MODE_WORD,
      pt: PROJECT_TEXT_COUNT_MODE_WORD,
    });
  });

  it("selects the writing count mode from the project language", () => {
    expect(getProjectLanguageTextCountMode("en")).toBe("word");
    expect(getProjectLanguageTextCountMode("ja")).toBe("character");
    expect(getProjectLanguageTextCountMode("zh-hans")).toBe("character");
    expect(getProjectLanguageTextCountMode("zh-hant")).toBe("character");
    expect(getProjectLanguageTextCountMode("ko")).toBe("word");
    expect(getProjectLanguageTextCountMode("th")).toBe("word");
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
