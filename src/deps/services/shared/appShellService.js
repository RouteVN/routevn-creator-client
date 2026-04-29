import { loadFont } from "./fontLoader.js";

const createNoopUpdater = () => ({
  checkForUpdates: async () => null,
  startAutomaticChecks: () => {},
  getUpdateInfo: () => null,
  getDownloadProgress: () => 0,
  isUpdateAvailable: () => false,
});

const normalizeTheme = (theme) => {
  return theme === "light" ? "light" : "dark";
};

const applyThemeToDocument = (
  theme,
  root = typeof document === "undefined" ? undefined : document,
) => {
  const resolvedTheme = normalizeTheme(theme);
  const body = root?.body;
  const documentElement = root?.documentElement;

  if (body?.classList) {
    body.classList.toggle("dark", resolvedTheme === "dark");
  }

  if (documentElement?.classList) {
    documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }

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

export const createAppShellService = ({
  router,
  subject,
  globalUI,
  filePicker,
  openUrl,
  appVersion,
  platform,
  updater,
  audioService,
}) => {
  const resolvedUpdater = {
    ...createNoopUpdater(),
    ...updater,
  };

  const getCurrentProjectId = () => {
    return router.getPayload()?.p ?? "";
  };

  return {
    navigate(path, payload) {
      subject.dispatch("redirect", { path, payload });
    },

    redirect(path, payload) {
      router.redirect(path, payload);
    },

    replace(path, payload) {
      router.replace(path, payload);
    },

    getPath() {
      return router.getPathName();
    },

    getPayload() {
      return router.getPayload();
    },

    getCurrentProjectId() {
      return getCurrentProjectId();
    },

    setPayload(payload) {
      router.setPayload(payload);
    },

    back() {
      router.back();
    },

    openUrl,

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

    checkForUpdates(silent) {
      return resolvedUpdater.checkForUpdates(silent);
    },

    startAutomaticUpdateChecks() {
      return resolvedUpdater.startAutomaticChecks();
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
