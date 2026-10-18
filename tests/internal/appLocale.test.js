import { describe, expect, it, vi } from "vitest";
import { activateAppLocale } from "../../src/internal/ui/appLocale.js";

describe("app locale", () => {
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
