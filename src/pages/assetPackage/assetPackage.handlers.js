import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../internal/assetPackageResources.js";
import {
  createAssetPackEditorPayload,
  getAssetPackEditorBackPath,
  resolveAssetPackEditorPayload,
} from "../../internal/assetPackEditorRoute.js";
import { exportAssetPack } from "../../internal/ui/assetPackExport.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";

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

// Saves the picks, changing only the types picked differently since they
// were last loaded or saved. A failed save says what went wrong, and the page
// goes back to the saved picks, as they are saved together or not at all.
const savePicks = async (deps) => {
  const { appService, i18n, projectService, render, store } = deps;
  const assetPackId = store.selectAssetPackId();
  const baseResources = store.selectBaseResources();
  const { resources } = store.selectAssetPackage();
  store.startSavingPicks();
  render();
  const saveAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: i18n.assetPackagePage.failedSaveAssetPackage,
    action: () =>
      projectService.updateAssetPackResources({
        assetPackId,
        baseResources,
        resources,
      }),
  });
  if (saveAttempt.ok) {
    store.finishSavingPicks({ savedResources: resources });
  } else {
    const assetPack =
      projectService.getRepositoryState()?.assetPacks?.items?.[assetPackId];
    store.setAssetPack({
      assetPackId,
      name: assetPack?.name,
      resources: assetPack?.resources,
    });
    store.finishSavingPicks();
  }
  render();
};

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

// Done applies the picker's ticks to the page and saves them. While a save
// is in flight, Done does nothing.
export const handlePickerDoneClick = async (deps) => {
  const { store } = deps;
  if (store.selectIsSavingPicks()) {
    return;
  }
  store.applyPicker();
  await savePicks(deps);
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
  await exportAssetPack({
    appService,
    i18n,
    projectService,
    getContents: () => store.selectAssetPackageData(),
    name: store.selectAssetPackName(),
  });
};
