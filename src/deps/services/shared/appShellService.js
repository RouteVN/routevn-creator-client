import { loadFont } from "./fontLoader.js";

const createNoopUpdater = () => ({
  checkForUpdates: async () => null,
  startAutomaticChecks: () => {},
  getUpdateInfo: () => null,
  getDownloadProgress: () => 0,
  isUpdateAvailable: () => false,
});

const isInputFocused = (root = document) => {
  let active = root.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
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

    showToast(message, options = {}) {
      globalUI.showAlert({ message, title: options.title || "Notice" });
    },

    showDialog(options) {
      return globalUI.showConfirm(options);
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
