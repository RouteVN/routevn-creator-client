import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../internal/assetPackageResources.js";
import {
  createAssetPackEditorPayload,
  getAssetPackEditorBackPath,
  resolveAssetPackEditorPayload,
} from "../../internal/assetPackEditorRoute.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { createAssetPackageManifest } from "./support/assetPackageManifest.js";

// The editor edits the asset pack the address names (`ap`).
export const handleBeforeMount = (deps) => {
  const { appService, projectService, store, uiConfig } = deps;
  const repositoryState = projectService.getRepositoryState();
  const resourceDataByType = {};
  for (const { resourceType } of ASSET_PACKAGE_RESOURCE_CONFIGS) {
    resourceDataByType[resourceType] = repositoryState?.[resourceType];
  }
  store.setUiConfig({ uiConfig });
  store.setFilesData({ filesData: repositoryState?.files });
  store.setScenesData({ scenesData: repositoryState?.scenes });
  store.setResourceData({ resourceDataByType });
  const { assetPackId } = resolveAssetPackEditorPayload(
    appService.getPayload() ?? {},
  );
  const assetPack = repositoryState?.assetPacks?.items?.[assetPackId];
  if (assetPack?.type === "assetPack") {
    store.setAssetPack({
      assetPackId,
      name: assetPack.name,
      resources: assetPack.resources,
    });
  }
};

const navigateBack = (deps) => {
  const { appService } = deps;
  appService.navigate(
    getAssetPackEditorBackPath(),
    createAssetPackEditorPayload({ payload: appService.getPayload() ?? {} }),
    { historyMode: "replace" },
  );
};

// An address naming no asset pack leads back to the list.
export const handleAfterMount = (deps) => {
  const { appService, i18n, store } = deps;
  if (store.selectAssetPackId()) {
    return;
  }
  appService.showToast({
    message: i18n.assetPackagePage.failedLoadAssetPackage,
    status: "error",
  });
  navigateBack(deps);
};

export const handleBackClick = (deps) => {
  navigateBack(deps);
};

const persistAssetPackage = async (deps) => {
  const { appService, i18n, projectService, store } = deps;
  let result;
  try {
    result = await projectService.updateAssetPack({
      assetPackId: store.selectAssetPackId(),
      data: { resources: store.selectAssetPackage().resources },
    });
  } catch {
    result = { valid: false };
  }
  if (result?.valid === false) {
    appService.showToast({
      message: i18n.assetPackagePage.failedSaveAssetPackage,
      status: "error",
    });
    return false;
  }
  return true;
};

// The pack's name, as a file name.
const toZipFileName = (name) =>
  `${(name ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-") || "asset-package"}.zip`;

export const handlePickerTypeClick = (deps, payload) => {
  const { render, store } = deps;
  const { resourceType } = payload._event.currentTarget.dataset;
  store.setPickerResourceType({ resourceType });
  render();
};

// Clicking a folder's box in the picker, or pressing Space on its checkbox,
// ticks or unticks it in the picker only; Done applies the ticks.
export const handlePickerFolderClick = (deps, payload) => {
  const { render, store } = deps;
  const { resourceType, folderId } = payload._event.currentTarget.dataset;
  store.toggleFolder({ resourceType, folderId });
  render();
};

// Done applies the picker's ticks to the page and saves them.
export const handlePickerDoneClick = async (deps) => {
  const { render, store } = deps;
  store.applyPicker();
  render();
  await persistAssetPackage(deps);
};

export const handlePickResourcesClick = (deps) => {
  const { render, store } = deps;
  store.openPicker();
  render();
};

// Escape or a click outside closes the picker without applying its ticks.
export const handlePickerClose = (deps) => {
  const { render, store } = deps;
  store.closePicker();
  render();
};

export const handleDownloadAssetPackageButtonClick = async (deps) => {
  const { appService, i18n, projectService, store } = deps;
  const copy = i18n.assetPackagePage;
  let manifest;
  try {
    manifest = createAssetPackageManifest(store.selectAssetPackageData());
  } catch (error) {
    console.error("[asset-package] Asset package export is invalid.", error);
    let message = copy.failedDownloadAssetPackage;
    if (error.code === "no_resources") {
      message = copy.selectResourcesBeforeExport;
    }
    appService.showToast({
      message,
      status: "error",
    });
    return;
  }

  let outputPath;
  try {
    outputPath = await appService.saveFilePicker({
      title: copy.saveAssetPackageTitle,
      defaultPath: toZipFileName(store.selectAssetPackName()),
      filters: [{ name: copy.zipFileTypeName, extensions: ["zip"] }],
    });
  } catch (error) {
    console.error("[asset-package] Failed to choose an export path.", error);
    appService.showToast({
      message: copy.failedDownloadAssetPackage,
      status: "error",
    });
    return;
  }

  if (!outputPath) {
    return;
  }

  const progressDialog = appService.showProgressDialog({
    title: copy.exportInProgressTitle,
    message: copy.exportInProgressMessage,
    status: copy.exportPreparingStatus,
    progress: {},
  });

  try {
    await progressDialog.waitForPaint();
    const bundle = await projectService.createAssetPackageBundle({ manifest });
    progressDialog.update({
      status: copy.exportSavingStatus,
      progress: {},
    });
    const savedPath = await appService.writeFile(outputPath, bundle);
    progressDialog.close();
    appService.showAlert({
      title: copy.exportCompletedTitle,
      message: formatI18nCopy(copy.exportCompletedMessage, {
        path: savedPath ?? outputPath,
      }),
    });
  } catch (error) {
    progressDialog.close();
    console.error("[asset-package] Failed to export asset package.", error);
    appService.showToast({
      message: copy.failedDownloadAssetPackage,
      status: "error",
    });
  }
};
