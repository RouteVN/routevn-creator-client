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
import * as storeModule from "../../src/pages/config/config.store.js";
import { EN_I18N } from "../support/i18n.js";

// The real store on fresh state, with every selector and action spied on.
const createStore = () => {
  const state = storeModule.createInitialState();
  return Object.fromEntries(
    Object.entries(storeModule)
      .filter(([, value]) => typeof value === "function")
      .map(([name, fn]) => [
        name,
        vi.fn((payload) => fn({ state, i18n: EN_I18N }, payload)),
      ]),
  );
};

const createDeps = () => {
  let currentLocale = "en";
  const appService = {
    getPlatform: vi.fn(() => "web"),
    getProjectFolderSetup: vi.fn(() => ({
      configured: true,
      folder: { displayPath: "On My iPhone/My Projects" },
    })),
    showFormDialog: vi.fn(async () => ({ actionId: "choose" })),
    pickProjectFolderSetup: vi.fn(async () => ({
      uri: "routevn-folder://selected/folder-2",
    })),
    confirmProjectFolderSetup: vi.fn(async () => ({
      configured: true,
      folder: { displayPath: "On My iPhone/Other Projects" },
    })),
    navigate: vi.fn(),
    getTheme: vi.fn(() => "dark"),
    setTheme: vi.fn((theme) => theme),
    getUserConfig: vi.fn(() => undefined),
    setUserConfig: vi.fn(),
    showToast: vi.fn(),
  };
  const locale = {
    available: vi.fn(() => [
      "en",
      "ja",
      "zh-hans",
      "es",
      "th",
      "ru",
      "pt",
      "fr",
      "vi",
      "id",
      "uk",
      "it",
      "pl",
    ]),
    current: vi.fn(() => currentLocale),
    set: vi.fn(async (nextLocale) => {
      currentLocale = nextLocale;
    }),
  };

  return {
    appService,
    locale,
    store: createStore(),
    uiConfig: { id: "normal", inputMode: "pointer" },
    i18n: EN_I18N,
    render: vi.fn(),
  };
};

describe("config handlers", () => {
  it("shows the configured iOS folder and changes it from a dialog", async () => {
    const deps = createDeps();
    deps.appService.getPlatform.mockReturnValue("ios");
    handleBeforeMount(deps);
    expect(deps.store.setProjectFolder).toHaveBeenCalledWith({
      visible: true,
      path: "On My iPhone/My Projects",
    });

    // Dismissing the dialog keeps the folder.
    deps.appService.showFormDialog.mockResolvedValueOnce(null);
    await handleChangeProjectFolder(deps);
    expect(deps.appService.showFormDialog).toHaveBeenCalledWith({
      size: "sm",
      form: {
        title: "Change Folder",
        description:
          "All your RouteVN projects are kept in one folder. Every project you create or import is saved there. Choose “On My iPhone” or an existing projects folder.",
        fields: [],
        actions: {
          buttons: [{ id: "choose", label: "Choose Folder", variant: "pr" }],
        },
      },
    });
    expect(deps.appService.pickProjectFolderSetup).not.toHaveBeenCalled();
    expect(deps.store.setProjectFolder).toHaveBeenCalledOnce();

    await handleChangeProjectFolder(deps);
    expect(deps.appService.confirmProjectFolderSetup).toHaveBeenCalledWith({
      uri: "routevn-folder://selected/folder-2",
    });
    expect(deps.store.setProjectFolder).toHaveBeenLastCalledWith({
      visible: true,
      path: "On My iPhone/Other Projects",
    });
    expect(deps.appService.navigate).not.toHaveBeenCalled();
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
      expect(deps.appService.showFormDialog).not.toHaveBeenCalled();
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
