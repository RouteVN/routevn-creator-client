import { generateId } from "../../internal/id.js";
import {
  ASSET_PACK_EDITOR_PATH,
  createAssetPackEditorPayload,
} from "../../internal/assetPackEditorRoute.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { selectAssetPacksPageCopy } from "./support/assetPacksPageCopy.js";
import { prepareAssetPacks } from "./support/prepareAssetPacks.js";

const selectCopy = (deps = {}) => selectAssetPacksPageCopy(deps.i18n);

const navigateToEditor = ({ appService, assetPackId } = {}) => {
  if (!assetPackId) {
    return;
  }

  appService.navigate(
    ASSET_PACK_EDITOR_PATH,
    createAssetPackEditorPayload({
      payload: appService.getPayload() ?? {},
      assetPackId,
    }),
  );
};

const normalizeSelectedAssetPack = (deps) => {
  const { render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  if (store.selectAssetPackItemById({ itemId: selectedItemId })) {
    return;
  }

  store.setSelectedItemId({ itemId: undefined });
  render();
};

const {
  handleBeforeMount,
  handleAfterMount: handleAfterMountBase,
  refreshData,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction: handleFileExplorerActionBase,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleItemClick: handleAssetPackItemClick,
  handleSearchInput,
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  openFolderNameDialogWithValues,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
} = createCatalogPageHandlers({
  resourceType: "assetPacks",
  copy: ({ i18n }) => selectAssetPacksPageCopy(i18n),
  onEditKey: ({ deps, selectedItemId }) => {
    navigateToEditor({
      appService: deps.appService,
      assetPackId: selectedItemId,
    });
  },
  createExplorerHandlers: ({ refresh }) =>
    createResourceFileExplorerHandlers({
      resourceType: "assetPacks",
      copy: ({ i18n }) => selectAssetPacksPageCopy(i18n),
      refresh: async (deps, options) => {
        await refresh(deps, options);
        normalizeSelectedAssetPack(deps);
      },
    }),
});

export {
  handleBeforeMount,
  handleFileExplorerSelectionChanged,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleAssetPackItemClick,
  handleSearchInput,
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
};

export const handleDataChanged = async (deps, options = {}) => {
  await refreshData(deps, options);
  normalizeSelectedAssetPack(deps);
};

export const handleAfterMount = async (deps) => {
  await handleAfterMountBase(deps);
  const copy = selectCopy(deps);
  const changed = await prepareAssetPacks({
    projectService: deps.projectService,
    folderName: copy.defaultFolderName ?? "Default",
    packName: copy.savedPackName ?? "Asset Pack",
  });
  if (changed) {
    await handleDataChanged(deps);
  }
};

export const handleFileExplorerAction = async (deps, payload) => {
  const { appService } = deps;
  const detail = payload?._event?.detail ?? {};
  const action = (detail.item ?? detail)?.value;
  if (action === "edit-item") {
    navigateToEditor({ appService, assetPackId: detail.itemId });
    return;
  }

  await handleFileExplorerActionBase(deps, payload);
};

export const handleAddAssetPackClick = (deps, payload) => {
  const { render, store } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog({ groupId });
  render();
};

export const handleAddDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeAddDialog();
  render();
};

export const handleAddFormAction = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      title: copy.warningTitle ?? "Warning",
      message: copy.nameRequired ?? "Please enter an asset pack name.",
    });
    return;
  }

  const assetPackId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedCreateAssetPack ?? "Failed to create asset pack.",
    action: () =>
      projectService.createAssetPack({
        assetPackId,
        parentId: store.selectTargetGroupId(),
        position: "last",
        data: {
          type: "assetPack",
          name,
          description: values?.description ?? "",
          resources: [],
        },
      }),
  });
  if (!createAttempt.ok) {
    return;
  }

  store.closeAddDialog();
  await handleDataChanged(deps, { selectedItemId: assetPackId });
};

export const handleAssetPackItemDoubleClick = (deps, payload) => {
  const { appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }
  navigateToEditor({ appService, assetPackId: itemId });
};

export const handleAssetPackItemEdit = (deps, payload) => {
  const { appService } = deps;
  navigateToEditor({
    appService,
    assetPackId: payload._event.detail.itemId,
  });
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const { refs, render, store } = deps;
  const { editForm, fileExplorer } = refs;
  const item = store.selectAssetPackItemById({ itemId });
  if (!item) {
    return;
  }

  const editValues = {
    name: item.name ?? "",
    description: item.description ?? "",
  };
  store.setSelectedItemId({ itemId, suppressMobileDetailSheet: true });
  fileExplorer?.selectItem?.({ itemId });
  store.openEditDialog({ itemId, defaultValues: editValues });
  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
};

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  const itemId = store.selectSelectedItemId();
  if (itemId) {
    openEditDialogWithValues({ deps, itemId });
    return;
  }

  openFolderNameDialogWithValues({
    deps,
    folderId: store.selectSelectedFolderId(),
  });
};

export const handleEditDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      title: copy.warningTitle ?? "Warning",
      message: copy.nameRequired ?? "Please enter an asset pack name.",
    });
    return;
  }

  const editItemId = store.selectEditItemId();
  if (!editItemId) {
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedUpdateAssetPack ?? "Failed to update asset pack.",
    action: () =>
      projectService.updateAssetPack({
        assetPackId: editItemId,
        data: { name, description: values?.description ?? "" },
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
  await handleDataChanged(deps, { selectedItemId: editItemId });
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const deleteAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedDeleteAssetPack ?? "Failed to delete asset pack.",
    action: () => projectService.deleteAssetPacks({ assetPackIds: [itemId] }),
  });
  if (!deleteAttempt.ok) {
    return;
  }
  await handleDataChanged(deps);
};

export const handleItemDuplicate = async (deps, payload) => {
  const { appService, projectService } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const duplicateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedDuplicateAssetPack ?? "Failed to duplicate asset pack.",
    action: () => projectService.duplicateAssetPack({ assetPackId: itemId }),
  });
  if (!duplicateAttempt.ok) {
    return;
  }
  await handleDataChanged(deps, { selectedItemId: duplicateAttempt.result });
};

export const handleMobileDetailOpenClick = (deps, payload) => {
  const { appService, store } = deps;
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  const itemId = store.selectSelectedItemId();
  if (itemId) {
    navigateToEditor({ appService, assetPackId: itemId });
  }
};

export const handleMobileDetailDuplicateClick = async (deps, payload) => {
  const { store } = deps;
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  const itemId = store.selectSelectedItemId();
  if (itemId) {
    await handleItemDuplicate(deps, { _event: { detail: { itemId } } });
  }
};

export const handleMobileDetailDeleteClick = async (deps, payload) => {
  const { store } = deps;
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  const itemId = store.selectSelectedItemId();
  if (itemId) {
    await handleItemDelete(deps, { _event: { detail: { itemId } } });
  }
};
