import { describe, expect, it, vi } from "vitest";
import {
  handleAfterMount,
  handleBeforeMount,
  handleLanguageChange,
} from "../../src/pages/language/language.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const createDeps = () => {
  let currentLocale = "en";
  const appService = {
    getUserConfig: vi.fn(() => undefined),
    setUserConfig: vi.fn(),
    showToast: vi.fn(),
  };
  const locale = {
    available: vi.fn(() => ["en", "ja", "zh-hans"]),
    current: vi.fn(() => currentLocale),
    set: vi.fn(async (nextLocale) => {
      currentLocale = nextLocale;
    }),
  };

  return {
    appService,
    locale,
    store: {
      selectCurrentLocale: vi.fn(() => currentLocale),
      setCurrentLocale: vi.fn(),
      setUiConfig: vi.fn(),
    },
    uiConfig: { id: "normal", inputMode: "pointer" },
    i18n: EN_I18N,
    render: vi.fn(),
  };
};

describe("settings language handlers", () => {
  it("loads the persisted app locale before mount", () => {
    const deps = createDeps();
    deps.appService.getUserConfig.mockReturnValue("ja");

    handleBeforeMount(deps);

    expect(deps.store.setUiConfig).toHaveBeenCalledWith({
      uiConfig: deps.uiConfig,
    });
    expect(deps.store.setCurrentLocale).toHaveBeenCalledWith({ locale: "ja" });
  });

  it("activates the persisted locale after mount", async () => {
    const deps = createDeps();
    deps.appService.getUserConfig.mockReturnValue("ja");

    await handleAfterMount(deps);

    expect(deps.locale.set).toHaveBeenCalledWith("ja");
    expect(deps.store.setCurrentLocale).toHaveBeenCalledWith({ locale: "ja" });
    expect(deps.appService.setUserConfig).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("activates and persists the selected locale", async () => {
    const deps = createDeps();

    await handleLanguageChange(deps, {
      _event: {
        detail: {
          value: "zh-hans",
        },
      },
    });

    expect(deps.locale.set).toHaveBeenCalledWith("zh-hans");
    expect(deps.appService.setUserConfig).toHaveBeenCalledWith(
      "app.locale",
      "zh-hans",
    );
    expect(deps.store.setCurrentLocale).toHaveBeenCalledWith({
      locale: "zh-hans",
    });
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the selected locale is already active", async () => {
    const deps = createDeps();

    await handleLanguageChange(deps, {
      _event: {
        detail: {
          value: "en",
        },
      },
    });

    expect(deps.locale.set).not.toHaveBeenCalled();
    expect(deps.appService.setUserConfig).not.toHaveBeenCalled();
    expect(deps.store.setCurrentLocale).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
  });

  it("shows stable feedback when changing the locale fails", async () => {
    const deps = createDeps();
    deps.locale.set.mockRejectedValue(new Error("locale unavailable"));

    await handleLanguageChange(deps, {
      _event: {
        detail: {
          value: "ja",
        },
      },
    });

    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Could not change the language. Please try again.",
    });
    expect(deps.store.setCurrentLocale).toHaveBeenNthCalledWith(1, {
      locale: "ja",
    });
    expect(deps.store.setCurrentLocale).toHaveBeenNthCalledWith(2, {
      locale: "en",
    });
    expect(deps.render).toHaveBeenCalledTimes(2);
  });
});
