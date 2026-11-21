import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import Subject from "../../src/deps/subject.js";
import * as suggestionStore from "../../src/components/language-suggestion/language-suggestion.store.js";
import {
  handleBeforeMount,
  handleCloseClick,
  handleSwitchClick,
} from "../../src/components/language-suggestion/language-suggestion.handlers.js";
import { APP_LOCALE_OPTIONS } from "../../src/internal/ui/appLocale.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

const CATALOGS = { en: EN_I18N, ja: JA_I18N };

// The component on its real store, on a device whose languages are given,
// with user config that reports its changes as the app does.
const createBox = ({ deviceLanguages = ["ja-JP"], userConfig = {} } = {}) => {
  let state = suggestionStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return suggestionStore[name]({ state }, payload);
        }
        state = produce(state, (draft) => {
          suggestionStore[name]({ state: draft }, payload);
        });
      },
    },
  );
  const subject = new Subject();
  const config = { ...userConfig };
  let currentLocale = "en";
  const deps = {
    store,
    subject,
    i18n: EN_I18N,
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    appService: {
      getUserConfig: vi.fn((key) => config[key]),
      setUserConfig: vi.fn((key, value) => {
        config[key] = value;
        subject.dispatch("app.userConfig.changed", { key });
      }),
      flushUserConfig: vi.fn(async () => {}),
      getDeviceLanguages: vi.fn(() => deviceLanguages),
      setDocumentLanguage: vi.fn(),
      showAlert: vi.fn(),
    },
    locale: {
      available: () => APP_LOCALE_OPTIONS.map((option) => option.value),
      current: () => currentLocale,
      load: vi.fn(async (locale) => CATALOGS[locale]),
      set: vi.fn(async (locale) => {
        currentLocale = locale;
      }),
    },
  };
  let cleanup;
  const mount = async () => {
    cleanup = handleBeforeMount(deps);
    await vi.waitFor(() => expect(deps.locale.load).toHaveBeenCalled());
    await Promise.resolve();
  };
  return {
    deps,
    config,
    mount,
    unmount: () => cleanup(),
    view: () => suggestionStore.selectViewData({ state }),
  };
};

describe("language suggestion", () => {
  it("offers the device language, written in that language", async () => {
    const box = createBox();
    await box.mount();

    expect(box.deps.locale.load).toHaveBeenCalledWith("ja");
    expect(box.view()).toEqual({
      visible: true,
      locale: "ja",
      message: JA_I18N.languageSuggestion.message,
      switchLabel: JA_I18N.languageSuggestion.switchButton,
      closeLabel: JA_I18N.languageSuggestion.closeButton,
      busy: false,
    });
    expect(box.deps.render).toHaveBeenCalled();
  });

  it.each([
    ["a language was chosen", { userConfig: { "app.locale": "en" } }],
    ["the device prefers English", { deviceLanguages: ["en-SG", "ja-JP"] }],
    [
      "it was closed before",
      { userConfig: { "app.localeSuggestionDismissed": true } },
    ],
  ])("shows nothing when %s", (_case, options) => {
    const box = createBox(options);
    handleBeforeMount(box.deps);

    expect(box.deps.locale.load).not.toHaveBeenCalled();
    expect(box.view().visible).toBe(false);
  });

  it("shows nothing when the suggested language cannot be loaded", async () => {
    const box = createBox();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    box.deps.locale.load.mockRejectedValue(new Error("offline"));
    handleBeforeMount(box.deps);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());

    expect(box.view().visible).toBe(false);
    warn.mockRestore();
  });

  it("shows nothing for a catalog without the box's text", async () => {
    const box = createBox();
    box.deps.locale.load.mockResolvedValue({ projectsPage: {} });
    await box.mount();

    expect(box.view().visible).toBe(false);
  });

  // The Language menu on the same page saves app.locale while the box shows.
  it("goes away when a language is chosen elsewhere", async () => {
    const box = createBox();
    await box.mount();
    box.deps.render.mockClear();

    box.deps.appService.setUserConfig("app.locale", "en");

    expect(box.view().visible).toBe(false);
    expect(box.deps.render).toHaveBeenCalled();
  });

  it("does not show when a language is chosen while its text loads", async () => {
    const box = createBox();
    let finishLoad;
    box.deps.locale.load.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLoad = () => resolve(JA_I18N);
        }),
    );
    handleBeforeMount(box.deps);
    box.deps.appService.setUserConfig("app.locale", "en");
    finishLoad();
    await vi.waitFor(() => expect(box.deps.locale.load).toHaveBeenCalled());
    await Promise.resolve();
    await Promise.resolve();

    expect(box.view().visible).toBe(false);
  });

  it("stops following user config when unmounted", async () => {
    const box = createBox();
    await box.mount();
    box.unmount();
    box.deps.render.mockClear();

    box.deps.appService.setUserConfig("app.locale", "en");

    expect(box.deps.render).not.toHaveBeenCalled();
  });

  it("switches the app to the language, saves it, and goes away", async () => {
    const box = createBox();
    await box.mount();

    await handleSwitchClick(box.deps);

    expect(box.deps.locale.set).toHaveBeenCalledWith("ja");
    expect(box.config["app.locale"]).toBe("ja");
    expect(box.deps.appService.flushUserConfig).toHaveBeenCalled();
    expect(box.deps.appService.setDocumentLanguage).toHaveBeenCalledWith("ja");
    expect(box.view().visible).toBe(false);
    const [event] = box.deps.dispatchEvent.mock.calls[0];
    expect(event.type).toBe("locale-change");
    expect(event.detail).toEqual({ locale: "ja" });
  });

  it("keeps the box and says so, in that language, when the switch fails", async () => {
    const box = createBox();
    await box.mount();
    box.deps.locale.set.mockRejectedValue(new Error("offline"));

    await handleSwitchClick(box.deps);

    const [{ message }] = box.deps.appService.showAlert.mock.calls[0];
    expect(message).toContain(JA_I18N.projectsPage.failedChangeLanguage);
    expect(message).toContain(JA_I18N.projectsPage.errorDetailsLabel);
    expect(message).toContain("offline");
    expect(box.view()).toMatchObject({ visible: true, busy: false });
    expect(box.config["app.locale"]).toBeUndefined();
    expect(box.deps.dispatchEvent).not.toHaveBeenCalled();
  });

  // The locale service falls back to English without an error when the
  // suggested catalog cannot load.
  it("treats a switch that fell back to English as failed", async () => {
    const box = createBox();
    await box.mount();
    box.deps.locale.set.mockImplementation(async () => {});

    await handleSwitchClick(box.deps);

    expect(box.deps.appService.showAlert).toHaveBeenCalledWith({
      message: JA_I18N.projectsPage.failedChangeLanguage,
    });
    expect(box.view()).toMatchObject({ visible: true, busy: false });
    expect(box.config["app.locale"]).toBeUndefined();
    expect(box.deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("disables closing while a switch runs", async () => {
    const box = createBox();
    await box.mount();
    let finishSwitch;
    box.deps.locale.set.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSwitch = resolve;
        }),
    );

    const switching = handleSwitchClick(box.deps);
    expect(box.view().busy).toBe(true);
    finishSwitch();
    await switching;
  });

  it("remembers for good that it was closed, and goes away", async () => {
    const box = createBox();
    await box.mount();

    await handleCloseClick(box.deps);

    expect(box.config["app.localeSuggestionDismissed"]).toBe(true);
    expect(box.deps.appService.flushUserConfig).toHaveBeenCalled();
    expect(box.config["app.locale"]).toBeUndefined();
    expect(box.view().visible).toBe(false);
  });
});
