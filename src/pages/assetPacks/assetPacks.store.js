import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { selectAssetPacksPageCopy } from "./support/assetPacksPageCopy.js";

const createMetadataFormFields = (copy = {}) => [
  {
    name: "name",
    type: "input-text",
    label: copy.nameLabel ?? "Name",
    required: true,
  },
  {
    name: "description",
    type: "input-textarea",
    label: copy.descriptionLabel ?? "Description",
  },
];

const createAddForm = (copy = {}) => ({
  title: copy.addTitle ?? "Add Asset Pack",
  actions: {
    buttons: [
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: copy.createButton ?? "Create",
      },
    ],
  },
  fields: createMetadataFormFields(copy),
});

const createEditForm = (copy = {}) => ({
  title: copy.editTitle ?? "Edit Asset Pack",
  actions: {
    buttons: [
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label: copy.updateButton ?? "Update",
      },
    ],
  },
  fields: createMetadataFormFields(copy),
});

const createExplorerItemContextMenuItems = (copy = {}) => [
  { label: copy.openButton ?? "Open", type: "item", value: "edit-item" },
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.duplicateMenuItem ?? "Duplicate",
    type: "item",
    value: "duplicate-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createCenterItemContextMenuItems = (copy = {}) => [
  { label: copy.openButton ?? "Open", type: "item", value: "edit-item" },
  {
    label: copy.duplicateMenuItem ?? "Duplicate",
    type: "item",
    value: "duplicate-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const {
  createInitialState: createCatalogInitialState,
  setItems,
  setSelectedItemId,
  setSelectedFolderId,
  setUiConfig,
  setAppWindowMetrics,
  selectIsTabletLandscape,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectItemById,
  selectFolderById,
  selectSelectedItemId,
  selectSelectedFolderId,
  selectFolderNameDialogItemId,
  setSearchQuery,
  openFolderNameDialog,
  closeFolderNameDialog,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "assetPack",
  resourceType: "assetPacks",
  title: "Asset Packs",
  selectedResourceId: "assetPacks",
  resourceCategory: "releases",
  addText: "Add",
  copy: selectAssetPacksPageCopy,
  extendViewData: ({ state, selectedItem, baseViewData, copy }) => ({
    ...baseViewData,
    itemContextMenuItems: createExplorerItemContextMenuItems(copy),
    centerItemContextMenuItems: createCenterItemContextMenuItems(copy),
    isAddDialogOpen: state.isAddDialogOpen,
    addForm: createAddForm(copy),
    addFormDefaults: { name: "", description: "" },
    isEditDialogOpen: state.isEditDialogOpen,
    editForm: createEditForm(copy),
    editDefaultValues: state.editDefaultValues,
    selectedItemDescription: selectedItem?.description ?? "",
    descriptionLabel: copy.descriptionLabel ?? "Description",
    openButton: copy.openButton ?? "Open",
    exportButton: copy.exportButton ?? "Export",
    // A pack with nothing picked has nothing to export.
    selectedItemExportDisabled: (selectedItem?.resources?.length ?? 0) === 0,
  }),
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isAddDialogOpen: false,
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: { name: "", description: "" },
  targetGroupId: undefined,
});

export {
  setItems,
  setSelectedItemId,
  setSelectedFolderId,
  setUiConfig,
  setAppWindowMetrics,
  selectIsTabletLandscape,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectFolderById,
  selectSelectedItemId,
  selectSelectedFolderId,
  selectFolderNameDialogItemId,
  setSearchQuery,
  openFolderNameDialog,
  closeFolderNameDialog,
};

export const selectAssetPackItemById = selectItemById;
export const selectTargetGroupId = ({ state }) => state.targetGroupId;
export const selectEditItemId = ({ state }) => state.editItemId;

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
};

export const openEditDialog = ({ state }, { itemId, defaultValues } = {}) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues.name = defaultValues?.name ?? "";
  state.editDefaultValues.description = defaultValues?.description ?? "";
};

export const closeEditDialog = ({ state }) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues.name = "";
  state.editDefaultValues.description = "";
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);
  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
