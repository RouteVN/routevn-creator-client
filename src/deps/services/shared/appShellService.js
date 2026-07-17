import { loadFont } from "./fontLoader.js";
import {
  createNavigationTiming,
  markNavigationTiming,
} from "../../../internal/navigationTiming.js";
import {
  APP_THEME_CLASS_NAMES,
  getThemeClassName,
  isDarkTheme,
  normalizeTheme,
} from "../../../internal/theme.js";

const createNoopUpdater = () => ({
  checkForUpdates: async () => null,
  startAutomaticChecks: () => {},
  getUpdateInfo: () => null,
  getDownloadProgress: () => 0,
  isUpdateAvailable: () => false,
});

const applyThemeToDocument = (
  theme,
  root = typeof document === "undefined" ? undefined : document,
) => {
  const resolvedTheme = normalizeTheme(theme);
  const body = root?.body;
  const documentElement = root?.documentElement;

  [body, documentElement].forEach((element) => {
    if (!element?.classList) {
      return;
    }

    element.classList.toggle("dark", isDarkTheme(resolvedTheme));
    APP_THEME_CLASS_NAMES.forEach((className) => {
      element.classList.toggle(
        className,
        className === getThemeClassName(resolvedTheme),
      );
    });

    if (element.dataset) {
      element.dataset.rvnTheme = resolvedTheme;
    }
  });

  return resolvedTheme;
};

const getActiveElement = (root = document) => {
  let active = root.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
};

const isInputFocused = (root = document) => {
  let active = getActiveElement(root);
  if (active) {
    const tagName = active.tagName;
    if (!["BODY", "DIALOG"].includes(tagName)) {
      return true;
    }
  }
  return false;
};

const hideVirtualKeyboard = (root = document) => {
  const resolvedWindow =
    root?.defaultView || (typeof window === "undefined" ? undefined : window);
  resolvedWindow?.navigator?.virtualKeyboard?.hide?.();
};

export const createAppShellService = ({
  router,
  subject,
  globalUI,
  filePicker,
  openUrl: openExternalUrl,
  appVersion,
  platform,
  distribution = "direct",
  updatesEnabled = false,
  updater,
  audioService,
}) => {
  const resolvedUpdater = {
    ...createNoopUpdater(),
    ...updater,
  };
  let appCopyProvider = () => ({});
  const beforeNavigationHandlers = new Set();

  const getAppCopy = () => {
    try {
      return appCopyProvider?.() ?? {};
    } catch {
      return {};
    }
  };

  const getCurrentProjectId = () => {
    return router.getPayload()?.p ?? "";
  };

  const prepareNavigation = async (payload = {}) => {
    for (const handler of beforeNavigationHandlers) {
      await handler(payload);
    }
  };

  return {
    setAppCopyProvider(provider) {
      appCopyProvider =
        typeof provider === "function" ? provider : () => provider ?? {};
    },

    getAppCopy,

    registerBeforeNavigation(handler) {
      beforeNavigationHandlers.add(handler);
      return () => {
        beforeNavigationHandlers.delete(handler);
      };
    },

    prepareNavigation,

    navigate(path, payload, options = {}) {
      const timing =
        options.timing ??
        createNavigationTiming({
          platform,
          source: "appService.navigate",
          path,
          payload,
        });
      const historyMode = options.historyMode;
      const historyState = options.historyState;
      markNavigationTiming(timing, "appService.navigate.dispatch");
      subject.dispatch("redirect", {
        path,
        payload,
        timing,
        historyMode,
        historyState,
      });
    },

    redirect(path, payload, options) {
      router.redirect(path, payload, options);
    },

    replace(path, payload, options) {
      router.replace(path, payload, options);
    },

    getPath() {
      return router.getPathName();
    },

    getPayload() {
      return router.getPayload();
    },

    getHistoryState() {
      return router.getHistoryState?.() ?? {};
    },

    getCurrentProjectId() {
      return getCurrentProjectId();
    },

    setPayload(payload, options) {
      router.setPayload(payload, options);
    },

    async back() {
      const target = router.getBackTarget?.();
      if (target) {
        await prepareNavigation(target);
      }
      const didGoBack = router.back();
      if (didGoBack === true) {
        subject.dispatch("app.route.request", {
          path: router.getPathName(),
          payload: router.getPayload(),
          historyState: router.getHistoryState?.() ?? {},
          navigationPrepared: true,
          shouldUpdateHistory: false,
        });
      }
      return didGoBack;
    },

    restoreAfterFailedHistoryPop() {
      router.restoreAfterFailedPop?.();
    },

    acceptCurrentHistoryEntry() {
      router.acceptCurrentHistoryEntry?.();
    },

    canGoBack() {
      return router.canGoBack?.() ?? true;
    },

    async openUrl(url) {
      try {
        await openExternalUrl(url);
      } catch {
        const copy = getAppCopy();
        globalUI.showToast({
          title: copy.errorTitle ?? "Error",
          message: copy.failedOpenLink ?? "Failed to open link.",
          status: "error",
        });
      }
    },

    showDialog(options) {
      return globalUI.showConfirm(options);
    },

    showAlert(options) {
      return globalUI.showAlert(options);
    },

    showToast(options) {
      return globalUI.showToast(options);
    },

    showFormDialog(options) {
      return globalUI.showFormDialog(options);
    },

    showComponentDialog(options) {
      return globalUI.showComponentDialog(options);
    },

    closeAll() {
      return globalUI.closeAll();
    },

    showDropdownMenu(options) {
      return globalUI.showDropdownMenu(options);
    },

    openFolderPicker(options) {
      return filePicker.openFolderPicker(options);
    },

    openFilePicker(options) {
      return filePicker.openFilePicker(options);
    },

    saveFilePicker(...args) {
      return filePicker.saveFilePicker(...args);
    },

    isInputFocused,

    blurActiveElement(root = document) {
      const active = getActiveElement(root);
      if (active?.blur) {
        active.blur();
      }
      hideVirtualKeyboard(root);
    },

    applyTheme(theme) {
      return applyThemeToDocument(theme);
    },

    getAppVersion() {
      return appVersion;
    },

    getPlatform() {
      return platform;
    },

    getDistribution() {
      return distribution;
    },

    areUpdatesEnabled() {
      return Boolean(updatesEnabled);
    },

    checkForUpdates(silent, options = {}) {
      return resolvedUpdater.checkForUpdates(silent, {
        ...options,
        copy: options.copy ?? getAppCopy(),
      });
    },

    startAutomaticUpdateChecks(options = {}) {
      return resolvedUpdater.startAutomaticChecks({
        ...options,
        getCopy: options.getCopy ?? getAppCopy,
      });
    },

    getUpdateInfo() {
      return resolvedUpdater.getUpdateInfo();
    },

    getUpdateDownloadProgress() {
      return resolvedUpdater.getDownloadProgress();
    },

    isUpdateAvailable() {
      return resolvedUpdater.isUpdateAvailable();
    },

    getAudioService() {
      return audioService;
    },

    async loadFont(fontName, fontUrl) {
      return loadFont(fontName, fontUrl);
    },
  };
};
