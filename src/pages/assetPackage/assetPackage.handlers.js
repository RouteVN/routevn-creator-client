import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../internal/assetPackageResources.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { createAssetPackageManifest } from "./support/assetPackageManifest.js";

export const handleBeforeMount = (deps) => {
  const { projectService, store, uiConfig } = deps;
  const repositoryState = projectService.getRepositoryState();
  const resourceDataByType = {};
  for (const { resourceType } of ASSET_PACKAGE_RESOURCE_CONFIGS) {
    resourceDataByType[resourceType] = repositoryState?.[resourceType];
  }
  store.setUiConfig({ uiConfig });
  store.setFilesData({ filesData: repositoryState?.files });
  store.setResourceData({ resourceDataByType });
};

export const handleAfterMount = async (deps) => {
  const { appService, i18n, projectService, render, store } = deps;
  try {
    const assetPackage = await projectService.getCurrentAssetPackage();
    store.setAssetPackage({ assetPackage });
    render();
  } catch {
    appService.showToast({
      message: i18n.assetPackagePage.failedLoadAssetPackage,
      status: "error",
    });
  }
};

const persistAssetPackage = async (deps) => {
  const { appService, i18n, projectService, store } = deps;
  try {
    await projectService.updateCurrentAssetPackage(store.selectAssetPackage());
    return true;
  } catch {
    appService.showToast({
      message: i18n.assetPackagePage.failedSaveAssetPackage,
      status: "error",
    });
    return false;
  }
};

export const handleResourceTypeHeaderClick = (deps, payload) => {
  const { render, store } = deps;
  const { resourceType } = payload._event.currentTarget.dataset;
  store.toggleResourceTypeCollapsed({ resourceType });
  render();
};

// Ticking a folder saves the selection at once.
export const handleFolderCheckboxChange = async (deps, payload) => {
  const { render, store } = deps;
  const { resourceType, folderId } = payload._event.currentTarget.dataset;
  store.toggleFolder({
    resourceType,
    folderId,
    selected: payload._event.detail.value === true,
  });
  render();
  await persistAssetPackage(deps);
};

export const handleFolderExpandClick = (deps, payload) => {
  const { render, store } = deps;
  const { resourceType, folderId } = payload._event.currentTarget.dataset;
  store.toggleFolderExpanded({ resourceType, folderId });
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
      defaultPath: "asset-package.zip",
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
