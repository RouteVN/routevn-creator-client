import { chooseProjectFolder } from "../../internal/ui/projectFolderSetupFlow.js";
import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  activateAppLocale,
  resolveAppLocale,
} from "../../internal/ui/appLocale.js";
import { selectConfigPageCopy } from "./support/configPageCopy.js";
import { formatPluralCopy } from "../../internal/ui/i18nCopy.js";
import {
  HELP_BUTTON_VISIBLE_CONFIG_KEY,
  isHelpButtonVisible,
} from "../../internal/ui/helpPreferences.js";
import {
  ASSET_PACKAGE_ENABLED_CONFIG_KEY,
  isAssetPackageEnabled,
} from "../../internal/ui/releasePreferences.js";

export const handleBeforeMount = (deps) => {
  const { appService, locale, projectService, store, uiConfig } = deps;

  store.setUiConfig({ uiConfig });
  store.setAndroidBackupVisible({
    visible: appService.getPlatform() === "android",
  });
  const isIOS = appService.getPlatform() === "ios";
  store.setProjectFolder({
    visible: isIOS,
    path: isIOS
      ? appService.getProjectFolderSetup().folder?.displayPath
      : undefined,
  });
  store.setImportPackageVisible({
    visible:
      projectService.getEnsuredProjectId() === appService.getCurrentProjectId(),
  });
  store.setAssetPackageEnabled({ enabled: isAssetPackageEnabled(appService) });
  store.setHelpButtonVisible({ visible: isHelpButtonVisible(appService) });
  store.setCurrentTheme({ theme: appService.getTheme() });
  store.setCurrentLocale({
    locale: resolveAppLocale({ appService, localeService: locale }),
  });
  return mountMobileResourceWindowLayout(deps);
};

export const handleAfterMount = async (deps) => {
  const { appService, i18n, locale, render, store } = deps;
  const copy = selectConfigPageCopy(i18n);

  try {
    const activeLocale = await activateAppLocale({
      appService,
      localeService: locale,
      locale: resolveAppLocale({ appService, localeService: locale }),
      persist: false,
    });
    store.setCurrentLocale({ locale: activeLocale });
    render();
  } catch {
    appService.showToast({ message: copy.failedChangeLanguage });
  }
};

// The open project's files are found through the projects folder, so the
// project closes before another folder is saved, and Config then opens it
// again: from the new folder, or not at all if that folder does not hold it.
export const handleChangeProjectFolder = async (deps) => {
  const { appService, projectService, store, render } = deps;
  if (appService.getPlatform() !== "ios") return;
  const projectId = appService.getCurrentProjectId();
  let isProjectClosed = false;
  const status = await chooseProjectFolder(deps, {
    beforeSave: async () => {
      isProjectClosed = true;
      await projectService.releaseProjectRuntime(projectId);
    },
  });
  if (status) {
    store.setProjectFolder({ visible: true, path: status.folder.displayPath });
    render();
  }
  if (isProjectClosed) {
    appService.navigate(appService.getPath(), appService.getPayload(), {
      historyMode: "none",
    });
  }
};

export const handleLanguageChange = async (deps, payload) => {
  const { appService, i18n, locale, render, store } = deps;
  const copy = selectConfigPageCopy(i18n);
  const { value: nextLocale } = payload._event.detail;
  const previousLocale = store.selectCurrentLocale();

  if (nextLocale === previousLocale) {
    return;
  }

  store.setCurrentLocale({ locale: nextLocale });
  render();

  try {
    const activeLocale = await activateAppLocale({
      appService,
      localeService: locale,
      locale: nextLocale,
    });
    if (activeLocale !== nextLocale) {
      await activateAppLocale({
        appService,
        localeService: locale,
        locale: previousLocale,
        persist: false,
      });
      throw new Error("Selected locale fell back to another locale");
    }
    render();
  } catch {
    store.setCurrentLocale({ locale: previousLocale });
    render();
    appService.showToast({ message: copy.failedChangeLanguage });
  }
};

export const handleAssetPackageChange = (deps, payload) => {
  const { appService, render, store } = deps;
  const { value: enabled } = payload._event.detail;

  appService.setUserConfig(ASSET_PACKAGE_ENABLED_CONFIG_KEY, enabled);
  store.setAssetPackageEnabled({ enabled });
  render();
};

export const handleHelpButtonChange = (deps, payload) => {
  const { appService, render, store } = deps;
  const { value: visible } = payload._event.detail;

  appService.setUserConfig(HELP_BUTTON_VISIBLE_CONFIG_KEY, visible);
  store.setHelpButtonVisible({ visible });
  render();
};

export const handleThemeCardClick = (deps, payload) => {
  const { appService, render, store } = deps;
  const { _event } = payload;
  const theme = _event.currentTarget?.dataset?.theme;
  const currentTheme = store.selectCurrentTheme();

  if (!theme || theme === currentTheme) {
    return;
  }

  const nextTheme = appService.setTheme(theme);
  store.setCurrentTheme({ theme: nextTheme });
  render();
};

// A package ZIP file. Both forms are named, as a platform's picker may know
// a file by its extension or by its type.
const ZIP_FILE_ACCEPT = ".zip,application/zip";

// A ZIP file is picked first, and the import dialog opens on it once one is
// chosen.
export const handleImportPackageZipClick = async (deps) => {
  const { appService, i18n, render, store } = deps;
  let file;
  try {
    file = await appService.pickFiles({
      accept: ZIP_FILE_ACCEPT,
      multiple: false,
    });
  } catch {
    appService.showToast({
      message: i18n.resourceImport.zipPickFailed,
      status: "error",
    });
    return;
  }
  if (!file) return;
  store.openImportDialog({ source: "zip", file });
  render();
};

// The import dialog opens on its URL form.
export const handleImportPackageUrlClick = (deps) => {
  const { render, store } = deps;
  store.openImportDialog({ source: "url" });
  render();
};

export const handleImportDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeImportDialog();
  render();
};

export const handleImportComplete = (deps, payload) => {
  const { appService, i18n, render, store } = deps;
  const { importedCount } = payload._event.detail;
  store.closeImportDialog();
  appService.showToast({
    message: formatPluralCopy(
      i18n.resourceImport,
      "assetPackageImported",
      importedCount,
      { dateTime: i18n.dateTime },
    ),
    status: "success",
  });
  render();
};
