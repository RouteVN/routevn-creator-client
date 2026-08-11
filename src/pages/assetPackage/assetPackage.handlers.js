import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../internal/assetPackageResources.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  createAssetPackageManifest,
  createAssetPackageMetadata,
} from "./support/assetPackageManifest.js";

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

export const handlePackageMetadataDetailClick = (deps) => {
  const { refs, render, store } = deps;
  store.openPackageMetadataEditDialog();
  render();

  const { packageMetadataEditForm } = refs;
  packageMetadataEditForm.reset();
  packageMetadataEditForm.setValues({
    values: store.selectPackageMetadataEditDefaultValues(),
  });
};

export const handlePackageMetadataDetailKeyDown = (deps, payload) => {
  if (payload._event.key !== "Enter" && payload._event.key !== " ") {
    return;
  }
  payload._event.preventDefault();
  handlePackageMetadataDetailClick(deps);
};

export const handlePackageMetadataEditDialogClose = (deps) => {
  const { render, store } = deps;
  store.closePackageMetadataEditDialog();
  render();
};

export const handlePackageMetadataEditFormAction = async (deps, payload) => {
  const { appService, i18n, render, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  let validatedMetadata;
  try {
    validatedMetadata = createAssetPackageMetadata(values);
  } catch {
    appService.showToast({
      message: i18n.assetPackagePage.invalidPackageInformation,
      status: "error",
    });
    return;
  }

  store.setPackageMetadata({
    packageMetadata: {
      id: validatedMetadata.id,
      name: validatedMetadata.name,
      version: validatedMetadata.version,
      description: validatedMetadata.description,
    },
  });
  if (!(await persistAssetPackage(deps))) {
    return;
  }
  store.closePackageMetadataEditDialog();
  render();
};

export const handleAddResourceTypeButtonClick = (deps, payload) => {
  const { render, store } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.openResourceTypeMenu({ x: rect.left, y: rect.bottom });
  render();
};

export const handleResourceTypeMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeResourceTypeMenu();
  render();
};

export const handleResourceTypeMenuItemClick = (deps, payload) => {
  const { render, store } = deps;
  const { item } = payload._event.detail;
  const position = store.selectResourceTypeMenuPosition();
  store.closeResourceTypeMenu();
  store.openResourceFolderPicker({
    resourceType: item.value,
    ...position,
  });
  render();
};

export const handleResourceTypeHeadingContextMenu = (deps, payload) => {
  const { render, store } = deps;
  const { resourceType } = payload._event.currentTarget.dataset;
  payload._event.preventDefault();
  store.openResourceTypeContextMenu({
    resourceType,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handleResourceTypeContextMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeResourceTypeContextMenu();
  render();
};

export const handleResourceTypeContextMenuItemClick = async (deps, payload) => {
  const { render, store } = deps;
  const { item } = payload._event.detail;
  const resourceType = store.selectResourceTypeContextMenuResourceType();
  store.closeResourceTypeContextMenu();
  let moved = false;

  if (item.value === "move-up") {
    store.moveResourceType({ resourceType, offset: -1 });
    moved = true;
  }
  if (item.value === "move-down") {
    store.moveResourceType({ resourceType, offset: 1 });
    moved = true;
  }
  render();
  if (moved) {
    await persistAssetPackage(deps);
  }
};

export const handleEditResourceFoldersButtonClick = (deps, payload) => {
  const { render, store } = deps;
  const { resourceType } = payload._event.currentTarget.dataset;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.openResourceFolderPicker({
    resourceType,
    x: rect.left,
    y: rect.bottom,
  });
  render();
};

export const handleResourceFolderPickerClose = (deps) => {
  const { render, store } = deps;
  store.closeResourceFolderPicker();
  render();
};

export const handleResourceFolderOptionClick = (deps, payload) => {
  const { render, store } = deps;
  const { folderId } = payload._event.currentTarget.dataset;
  store.toggleResourceFolderSelection({ folderId });
  render();
};

export const handleConfirmResourceFolders = async (deps) => {
  const { render, store } = deps;
  store.confirmResourceFolderSelection();
  render();
  await persistAssetPackage(deps);
};

export const handleDownloadAssetPackageButtonClick = async (deps) => {
  const { appService, i18n, projectService, store } = deps;
  const copy = i18n.assetPackagePage;
  let manifest;
  try {
    const repository = store.selectAssetPackageData();
    manifest = createAssetPackageManifest({
      repository,
      packageMetadata: store.selectPackageMetadata(),
    });
  } catch (error) {
    console.error("[asset-package] Asset package export is invalid.", error);
    let message = copy.failedDownloadAssetPackage;
    if (error.code === "no_resources") {
      message = copy.selectResourcesBeforeExport;
    }
    if (
      error.code === "missing_metadata" ||
      error.code === "invalid_metadata"
    ) {
      message = copy.completePackageInformationBeforeExport;
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
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
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
