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
      "zh-Hans",
      "zh-Hant",
      "ko",
      "es",
      "fr",
      "it",
      "pt",
      "ar",
      "ru",
      "uk",
      "bn",
      "hi",
      "ur",
      "id",
      "ms",
      "th",
      "vi",
      "fil",
      "de",
      "mr",
      "te",
      "tr",
      "ta",
      "fa",
      "sw",
      "ha",
      "pa-Guru",
      "gu",
      "pl",
      "nl",
    ]);
    expect(DEFAULT_PROJECT_LANGUAGE).toBe("en");
    expect(Object.keys(PROJECT_LANGUAGE_TEXT_COUNT_MODES)).toEqual(
      PROJECT_LANGUAGES,
    );
    expect(
      PROJECT_LANGUAGES.filter(
        (language) =>
          PROJECT_LANGUAGE_TEXT_COUNT_MODES[language] ===
          PROJECT_TEXT_COUNT_MODE_CHARACTER,
      ),
    ).toEqual(["ja", "zh-Hans", "zh-Hant"]);
    expect(PROJECT_LANGUAGE_TEXT_COUNT_MODES.en).toBe(
      PROJECT_TEXT_COUNT_MODE_WORD,
    );
  });

  it("selects the writing count mode from the project language", () => {
    expect(getProjectLanguageTextCountMode("en")).toBe("word");
    expect(getProjectLanguageTextCountMode("ja")).toBe("character");
    expect(getProjectLanguageTextCountMode("zh-Hans")).toBe("character");
    expect(getProjectLanguageTextCountMode("zh-Hant")).toBe("character");
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
