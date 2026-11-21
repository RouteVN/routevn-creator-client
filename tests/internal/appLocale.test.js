import { describe, expect, it, vi } from "vitest";
import { PROJECT_LANGUAGES } from "../../src/internal/projectLanguage.js";
import {
  activateAppLocale,
  APP_LOCALE_OPTIONS,
} from "../../src/internal/ui/appLocale.js";

describe("app locale", () => {
  it("starts with the most used languages, as project languages do, and each is a project language", () => {
    const appLanguages = APP_LOCALE_OPTIONS.map(
      (option) => Intl.getCanonicalLocales(option.value)[0],
    );
    const mostUsed = ["en", "es", "pt", "ru", "ja", "zh-Hans", "zh-Hant", "ko"];

    expect(appLanguages.slice(0, mostUsed.length)).toEqual(mostUsed);
    expect(PROJECT_LANGUAGES.slice(0, mostUsed.length)).toEqual(mostUsed);
    expect(
      appLanguages.filter((language) => !PROJECT_LANGUAGES.includes(language)),
    ).toEqual([]);
  });

  it("does not persist a fallback locale as the requested preference", async () => {
    const appService = {
      setUserConfig: vi.fn(),
    };
    const localeService = {
      available: vi.fn(() => ["en", "ja", "zh-hans"]),
      current: vi.fn(() => "en"),
      set: vi.fn(async () => {}),
    };

    const activeLocale = await activateAppLocale({
      appService,
      localeService,
      locale: "ja",
    });

    expect(activeLocale).toBe("en");
    expect(appService.setUserConfig).not.toHaveBeenCalled();
  });

  it("sets the document language to the active locale", async () => {
    let currentLocale = "en";
    const appService = {
      setUserConfig: vi.fn(),
      setDocumentLanguage: vi.fn(),
    };
    const localeService = {
      available: vi.fn(() => ["en", "pt"]),
      current: vi.fn(() => currentLocale),
      set: vi.fn(async (locale) => {
        currentLocale = locale;
      }),
    };

    await activateAppLocale({
      appService,
      localeService,
      locale: "pt",
      persist: false,
    });

    expect(appService.setDocumentLanguage).toHaveBeenCalledWith("pt");
  });
});
