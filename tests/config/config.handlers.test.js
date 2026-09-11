import { describe, expect, it, vi } from "vitest";
import {
  handleAssetPackageChange,
  handleAfterMount,
  handleBeforeMount,
  handleChangeProjectFolder,
  handleLanguageChange,
  handleHelpButtonChange,
  handleThemeCardClick,
} from "../../src/pages/config/config.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const createDeps = () => {
  let currentLocale = "en";
  const appService = {
    getPlatform: vi.fn(() => "web"),
    getProjectFolderSetup: vi.fn(() => ({
      configured: true,
      folder: { displayPath: "On My iPhone/My Projects" },
    })),
    navigate: vi.fn(),
    getTheme: vi.fn(() => "dark"),
    setTheme: vi.fn((theme) => theme),
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
      selectCurrentTheme: vi.fn(() => "dark"),
      setCurrentTheme: vi.fn(),
      selectCurrentLocale: vi.fn(() => currentLocale),
      setCurrentLocale: vi.fn(),
      setUiConfig: vi.fn(),
      setProjectFolder: vi.fn(),
      setAssetPackageEnabled: vi.fn(),
      setHelpButtonVisible: vi.fn(),
    },
    uiConfig: { id: "normal", inputMode: "pointer" },
    i18n: EN_I18N,
    render: vi.fn(),
  };
};

describe("config handlers", () => {
  it("loads the configured iOS folder and reopens setup without changing it", () => {
    const deps = createDeps();
    deps.appService.getPlatform.mockReturnValue("ios");
    handleBeforeMount(deps);
    expect(deps.store.setProjectFolder).toHaveBeenCalledWith({
      visible: true,
      path: "On My iPhone/My Projects",
    });
    handleChangeProjectFolder(deps);
    expect(deps.appService.navigate).toHaveBeenCalledExactlyOnceWith(
      "/project-folder-setup",
      { from: "config" },
    );
    // Remounting Config reads the latest confirmed folder.
    deps.appService.getProjectFolderSetup.mockReturnValue({
      configured: true,
      folder: { displayPath: "On My iPhone/Other Projects" },
    });
    handleBeforeMount(deps);
    expect(deps.store.setProjectFolder).toHaveBeenLastCalledWith({
      visible: true,
      path: "On My iPhone/Other Projects",
    });
  });

  it.each(["web", "android", "tauri"])(
    "does not expose or open the iOS folder setup on %s",
    (platform) => {
      const deps = createDeps();
      deps.appService.getPlatform.mockReturnValue(platform);
      handleBeforeMount(deps);
      handleChangeProjectFolder(deps);
      expect(deps.store.setProjectFolder).toHaveBeenCalledWith({
        visible: false,
        path: undefined,
      });
      expect(deps.appService.getProjectFolderSetup).not.toHaveBeenCalled();
      expect(deps.appService.navigate).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, false, true])(
    "loads help button visibility %s before mount, defaulting to shown",
    (visible) => {
      const deps = createDeps();
      deps.appService.getUserConfig.mockImplementation((key) =>
        key === "app.showHelpButton" ? visible : undefined,
      );

      handleBeforeMount(deps);

      expect(deps.store.setHelpButtonVisible).toHaveBeenCalledWith({
        visible: visible !== false,
      });
    },
  );

  it.each([false, true])("persists help button visibility %s", (visible) => {
    const deps = createDeps();

    handleHelpButtonChange(deps, {
      _event: { detail: { value: visible } },
    });

    expect(deps.appService.setUserConfig).toHaveBeenCalledExactlyOnceWith(
      "app.showHelpButton",
      visible,
    );
    expect(deps.store.setHelpButtonVisible).toHaveBeenCalledWith({ visible });
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it.each([undefined, false, true])(
    "loads the global Asset Package preference %s before mount",
    (enabled) => {
      const deps = createDeps();
      deps.appService.getUserConfig.mockImplementation((key) =>
        key === "release.assetPackageEnabled" ? enabled : undefined,
      );

      handleBeforeMount(deps);

      expect(deps.store.setAssetPackageEnabled).toHaveBeenCalledWith({
        enabled: enabled === true,
      });
    },
  );

  it.each([true, false])(
    "persists Asset Package enabled=%s globally",
    (enabled) => {
      const deps = createDeps();

      handleAssetPackageChange(deps, {
        _event: { detail: { value: enabled } },
      });

      expect(deps.appService.setUserConfig).toHaveBeenCalledExactlyOnceWith(
        "release.assetPackageEnabled",
        enabled,
      );
      expect(deps.store.setAssetPackageEnabled).toHaveBeenCalledWith({
        enabled,
      });
      expect(deps.render).toHaveBeenCalledOnce();
    },
  );

  it("switches theme without changing the app language", () => {
    const deps = createDeps();
    handleThemeCardClick(deps, {
      _event: { currentTarget: { dataset: { theme: "light" } } },
    });
    expect(deps.appService.setTheme).toHaveBeenCalledWith("light");
    expect(deps.store.setCurrentTheme).toHaveBeenCalledWith({ theme: "light" });
    expect(deps.store.setCurrentLocale).not.toHaveBeenCalled();
    expect(deps.locale.set).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("loads both theme and locale before mount", () => {
    const deps = createDeps();
    deps.appService.getUserConfig.mockReturnValue("ja");

    handleBeforeMount(deps);

    expect(deps.store.setUiConfig).toHaveBeenCalledWith({
      uiConfig: deps.uiConfig,
    });
    expect(deps.store.setCurrentTheme).toHaveBeenCalledWith({ theme: "dark" });
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

  it("reports a locale fallback without replacing the saved preference", async () => {
    const deps = createDeps();
    deps.locale.set.mockResolvedValue(undefined);
    deps.locale.current.mockReturnValue("en");

    await handleLanguageChange(deps, {
      _event: {
        detail: {
          value: "ja",
        },
      },
    });

    expect(deps.locale.set).toHaveBeenNthCalledWith(1, "ja");
    expect(deps.locale.set).toHaveBeenNthCalledWith(2, "en");
    expect(deps.appService.setUserConfig).not.toHaveBeenCalled();
    expect(deps.store.setCurrentLocale).toHaveBeenNthCalledWith(1, {
      locale: "ja",
    });
    expect(deps.store.setCurrentLocale).toHaveBeenNthCalledWith(2, {
      locale: "en",
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Could not change the language. Please try again.",
    });
    expect(deps.render).toHaveBeenCalledTimes(2);
  });
});
