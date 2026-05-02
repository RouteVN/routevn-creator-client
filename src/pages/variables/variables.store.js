import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "../../internal/variableEnums.js";
import {
  buildTagViewData,
  closeCreateTagDialogState,
  commitDetailTagIdsState,
  createTagForm,
  createTagState,
  openCreateTagDialogState,
  setActiveTagIdsState,
  setDetailTagIdsState,
  setDetailTagPopoverOpenState,
  setTagsDataState,
  syncDetailTagIds,
} from "../../internal/ui/resourcePages/tags.js";
import {
  buildMobileResourcePageViewData,
  closeMobileResourceFileExplorerState,
  createMobileResourcePageState,
  openMobileResourceFileExplorerState,
  setMobileResourcePageUiConfigState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";

const folderContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const itemContextMenuItems = [
  { label: "Edit", type: "item", value: "edit-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const emptyContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-item" },
];

export const VARIABLE_TAG_SCOPE_KEY = "variables";

const createTagFormDefinition = createTagForm();

const folderNameForm = {
  title: "Edit Folder",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Name",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Save",
        validate: true,
      },
    ],
  },
};

const selectVariableItem = (state, itemId) => {
  const item = state.variablesData?.items?.[itemId];
  return item?.type === "variable" ? item : undefined;
};

export const createInitialState = () => ({
  variablesData: { tree: [], items: {} },
  selectedItemId: undefined,
  selectedFolderId: undefined,
  searchQuery: "",
  isFolderNameDialogOpen: false,
  folderNameDialogItemId: undefined,
  folderNameDialogDefaultValues: {
    name: "",
  },
  ...createTagState(),
  ...createMobileResourcePageState(),
  folderContextMenuItems,
  itemContextMenuItems,
  emptyContextMenuItems,
});

export const setItems = ({ state }, { variablesData } = {}) => {
  state.variablesData = variablesData;
  if (
    state.selectedFolderId &&
    state.variablesData?.items?.[state.selectedFolderId]?.type !== "folder"
  ) {
    state.selectedFolderId = undefined;
  }
  syncDetailTagIds({
    state,
    item: selectVariableItem(state, state.selectedItemId),
    preserveDirty: true,
  });
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
  if (itemId !== undefined) {
    state.selectedFolderId = undefined;
  }
  state.isDetailTagSelectOpen = false;
  syncDetailTagIds({
    state,
    item: selectVariableItem(state, itemId),
  });
};

export const setSelectedFolderId = ({ state }, { folderId } = {}) => {
  state.selectedFolderId = folderId;
  if (folderId !== undefined) {
    state.selectedItemId = undefined;
    state.isDetailTagSelectOpen = false;
    syncDetailTagIds({
      state,
      item: undefined,
    });
  }
};

export const openFolderNameDialog = (
  { state },
  { folderId, defaultValues } = {},
) => {
  state.isFolderNameDialogOpen = true;
  state.folderNameDialogItemId = folderId;
  state.folderNameDialogDefaultValues = {
    name: defaultValues?.name ?? "",
  };
};

export const closeFolderNameDialog = ({ state }, _payload = {}) => {
  state.isFolderNameDialogOpen = false;
  state.folderNameDialogItemId = undefined;
  state.folderNameDialogDefaultValues = {
    name: "",
  };
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  setMobileResourcePageUiConfigState(state, {
    uiConfig,
  });
};

export const openMobileFileExplorer = ({ state }, _payload = {}) => {
  openMobileResourceFileExplorerState(state);
};

export const closeMobileFileExplorer = ({ state }, _payload = {}) => {
  closeMobileResourceFileExplorerState(state);
};

export const setTagsData = ({ state }, { tagsData } = {}) => {
  setTagsDataState({
    state,
    tagsData,
  });
};

export const setActiveTagIds = ({ state }, { tagIds } = {}) => {
  setActiveTagIdsState({
    state,
    tagIds,
  });
};

export const setDetailTagIds = ({ state }, { tagIds } = {}) => {
  setDetailTagIdsState({
    state,
    tagIds,
  });
};

export const commitDetailTagIds = ({ state }, { tagIds } = {}) => {
  commitDetailTagIdsState({
    state,
    tagIds,
  });
};

export const setDetailTagPopoverOpen = ({ state }, { open, item } = {}) => {
  setDetailTagPopoverOpenState({
    state,
    open,
    item,
  });
};

export const openCreateTagDialog = (
  { state },
  { mode, itemId, draftTagIds } = {},
) => {
  openCreateTagDialogState({
    state,
    mode,
    itemId,
    draftTagIds,
  });
};

export const closeCreateTagDialog = ({ state }, _payload = {}) => {
  closeCreateTagDialogState({
    state,
  });
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectSelectedFolderId = ({ state }) => state.selectedFolderId;

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return undefined;
  return selectVariableItem(state, state.selectedItemId);
};

export const selectFolderById = ({ state }, { folderId } = {}) => {
  const item = state.variablesData?.items?.[folderId];
  return item?.type === "folder" ? item : undefined;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.variablesData);
  const flatGroups = toFlatGroups(state.variablesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : undefined;
  const selectedFolder = state.selectedFolderId
    ? state.variablesData?.items?.[state.selectedFolderId]
    : undefined;
  const selectedDetailId = selectedItem?.id ?? selectedFolder?.id;
  const selectedDetailName = selectedItem?.name ?? selectedFolder?.name ?? "";

  let selectedVariableDefault = "";
  if (typeof selectedItem?.default === "boolean") {
    selectedVariableDefault = selectedItem.default ? "true" : "false";
  } else if (selectedItem?.default !== undefined) {
    selectedVariableDefault = String(selectedItem.default);
  }

  const selectedItemIsEnum = isVariableEnumEnabled(selectedItem);
  const selectedEnumValues = selectedItemIsEnum
    ? normalizeVariableEnumValues(selectedItem.enumValues)
    : [];

  const detailFields = [];
  if (selectedItem) {
    detailFields.push(
      {
        type: "description",
        value: selectedItem.description ?? "",
      },
      {
        type: "slot",
        slot: "variable-tags",
        label: "Tags",
      },
      {
        type: "text",
        label: "Scope",
        value: selectedItem.scope ?? "",
      },
      {
        type: "text",
        label: "Type",
        value: selectedItem.type ?? "",
      },
    );

    if (selectedItemIsEnum) {
      detailFields.push(
        {
          type: "text",
          label: "Enum",
          value: "Yes",
        },
        {
          type: "text",
          label: "Values",
          value: selectedEnumValues.join(", "),
        },
      );
    }

    detailFields.push({
      type: "text",
      label: "Default",
      value: selectedVariableDefault,
    });
  } else if (selectedFolder?.type === "folder") {
    detailFields.push({
      type: "text",
      label: "Type",
      value: "folder",
    });
  }

  return {
    flatItems,
    flatGroups,
    title: "Variables",
    resourceCategory: "systemConfig",
    selectedResourceId: "variables",
    selectedItemId: state.selectedItemId,
    selectedFolderId: state.selectedFolderId,
    selectedDetailId,
    selectedDetailName,
    selectedItemName: selectedDetailName,
    detailFields,
    ...buildMobileResourcePageViewData({
      state,
      detailFields,
    }),
    ...buildTagViewData({
      state,
      selectedItem,
      createTagFormDefinition,
      tagFilterPlaceholder: "Filter tags",
    }),
    folderContextMenuItems: state.folderContextMenuItems,
    itemContextMenuItems: state.itemContextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
    isFolderNameDialogOpen: state.isFolderNameDialogOpen,
    folderNameDialogItemId: state.folderNameDialogItemId,
    folderNameForm,
    folderNameDialogDefaultValues: state.folderNameDialogDefaultValues,
  };
};
