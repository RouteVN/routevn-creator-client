import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { matchesTagAwareSearch } from "../../internal/resourceTags.js";

export const COLOR_TAG_SCOPE_KEY = "colors";

const hexToRgb = (hex) => {
  if (!hex) {
    return "";
  }

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return "";
  }

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgb(${r}, ${g}, ${b})`;
};

const editForm = {
  title: "Edit Color",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: "Description",
      required: false,
    },
    createTagField(),
    {
      name: "hex",
      type: "color-picker",
      label: "Color",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Update Color",
      },
    ],
  },
};

const addForm = {
  title: "Add Color",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Color Name",
      required: true,
    },
    {
      name: "description",
      type: "input-textarea",
      label: "Description",
      required: false,
    },
    createTagField(),
    {
      name: "hex",
      type: "color-picker",
      label: "Color",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Add Color",
      },
    ],
  },
};

const buildDetailFields = (item) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "slot",
      slot: "color-preview",
      label: "",
    },
    {
      type: "description",
      value: item.description ?? "",
    },
    {
      type: "slot",
      slot: "color-tags",
      label: "Tags",
    },
    {
      type: "text",
      label: "Hex Value",
      value: item.hex ?? "",
    },
    {
      type: "text",
      label: "RGB Value",
      value: hexToRgb(item.hex ?? ""),
    },
  ];
};

const buildCatalogItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "color",
  swatchHex: item.hex ?? "#ffffff",
});

const matchesSearch = (item, searchQuery) => {
  const normalizedSearchQuery = (searchQuery ?? "").toLowerCase().trim();
  if (!normalizedSearchQuery) {
    return true;
  }

  const hex = (item.hex ?? "").toLowerCase();
  return (
    matchesTagAwareSearch(item, normalizedSearchQuery) ||
    hex.includes(normalizedSearchQuery)
  );
};

const selectColorDataItem = (state, itemId) => {
  const item = state.data?.items?.[itemId];
  return item?.type === "color" ? item : undefined;
};

const {
  createInitialState: createCatalogInitialState,
  setItems,
  setSelectedItemId,
  setSelectedFolderId,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectItemById,
  selectFolderById,
  selectSelectedItemId,
  selectSelectedFolderId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "color",
  resourceType: "colors",
  title: "Colors",
  selectedResourceId: "colors",
  resourceCategory: "userInterface",
  addText: "Add",
  matchesSearch,
  buildDetailFields,
  buildCatalogItem,
  hiddenMobileDetailSlots: ["color-preview"],
  tagging: {
    tagFilterPlaceholder: "Filter tags",
  },
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const editItem = selectColorDataItem(state, state.editItemId);

    return {
      ...baseViewData,
      selectedColorHex: selectedItem?.hex ?? "",
      isEditDialogOpen: state.isEditDialogOpen,
      editDefaultValues: {
        name: editItem?.name ?? "",
        hex: editItem?.hex ?? "",
        description: editItem?.description ?? "",
        tagIds: editItem?.tagIds ?? [],
      },
      editForm,
      isPreviewDialogOpen: state.isPreviewDialogOpen,
      previewColorHex: selectedItem?.hex ?? "",
      isAddDialogOpen: state.isAddDialogOpen,
      addDefaultValues: state.addDefaultValues,
      addForm,
    };
  },
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isEditDialogOpen: false,
  editItemId: undefined,
  isPreviewDialogOpen: false,
  isAddDialogOpen: false,
  targetGroupId: undefined,
  addDefaultValues: {
    name: "",
    description: "",
    tagIds: [],
    hex: "#ffffff",
  },
});

export {
  setItems,
  setSelectedItemId,
  setSelectedFolderId,
  setUiConfig,
  openMobileFileExplorer,
  closeMobileFileExplorer,
  selectSelectedItem,
  selectFolderById,
  selectSelectedItemId,
  selectSelectedFolderId,
  setSearchQuery,
  setTagsData,
  setActiveTagIds,
  setDetailTagIds,
  commitDetailTagIds,
  setDetailTagPopoverOpen,
  openCreateTagDialog,
  closeCreateTagDialog,
  openFolderNameDialog,
  closeFolderNameDialog,
};

export const selectColorItemById = selectItemById;

export const openEditDialog = ({ state }, { itemId } = {}) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
};

export const openPreviewDialog = ({ state }, _payload = {}) => {
  state.isPreviewDialogOpen = true;
};

export const closePreviewDialog = ({ state }, _payload = {}) => {
  state.isPreviewDialogOpen = false;
};

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }, _payload = {}) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
  state.addDefaultValues = {
    name: "",
    description: "",
    tagIds: [],
    hex: "#ffffff",
  };
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
