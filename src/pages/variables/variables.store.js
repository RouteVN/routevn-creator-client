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

const selectVariableItem = (state, itemId) => {
  const item = state.variablesData?.items?.[itemId];
  return item?.type === "variable" ? item : undefined;
};

export const createInitialState = () => ({
  variablesData: { tree: [], items: {} },
  selectedItemId: undefined,
  searchQuery: "",
  ...createTagState(),
  ...createMobileResourcePageState(),
  folderContextMenuItems,
  itemContextMenuItems,
  emptyContextMenuItems,
});

export const setItems = ({ state }, { variablesData } = {}) => {
  state.variablesData = variablesData;
  syncDetailTagIds({
    state,
    item: selectVariableItem(state, state.selectedItemId),
    preserveDirty: true,
  });
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
  state.isDetailTagSelectOpen = false;
  syncDetailTagIds({
    state,
    item: selectVariableItem(state, itemId),
  });
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

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return undefined;
  return selectVariableItem(state, state.selectedItemId);
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.variablesData);
  const flatGroups = toFlatGroups(state.variablesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : undefined;

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
  }

  return {
    flatItems,
    flatGroups,
    title: "Variables",
    resourceCategory: "systemConfig",
    selectedResourceId: "variables",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
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
  };
};
