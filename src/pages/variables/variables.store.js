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
  selectActiveTagIdsState,
  selectCreateTagContextState,
  selectDetailTagIdsState,
  selectTagsDataState,
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
  selectIsMobileFileExplorerOpenState,
  selectIsTouchModeState,
  selectSuppressMobileDetailSheetState,
  setMobileResourceDetailSheetSuppressedState,
  setMobileResourcePageUiConfigState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { selectVariablesPageCopy } from "./support/variablesPageCopy.js";

const createFolderContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-item",
  },
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createItemContextMenuItems = (copy = {}) => [
  { label: copy.editMenuItem ?? "Edit", type: "item", value: "edit-item" },
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createEmptyContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-item",
  },
];

export const VARIABLE_TAG_SCOPE_KEY = "variables";

const createFolderNameForm = (copy = {}) => ({
  title: copy.editFolderTitle ?? "Edit Folder",
  fields: [
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
      required: false,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.saveButton ?? "Save",
        validate: true,
      },
    ],
  },
});

const getScopeLabel = (scope, copy = {}) => {
  if (scope === "device") {
    return copy.scopeDeviceLabel ?? "Device";
  }
  if (scope === "account") {
    return copy.scopeAccountLabel ?? "Account";
  }
  return copy.scopeContextLabel ?? "Context";
};

const getVariableTypeLabel = (variableType, copy = {}) => {
  if (variableType === "number") {
    return copy.variableTypeNumberLabel ?? "Number";
  }
  if (variableType === "boolean") {
    return copy.variableTypeBooleanLabel ?? "Boolean";
  }
  return copy.variableTypeStringLabel ?? "String";
};

const getBooleanLabel = (value, copy = {}) => {
  return value
    ? (copy.booleanTrueLabel ?? "True")
    : (copy.booleanFalseLabel ?? "False");
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
    description: "",
  },
  ...createTagState(),
  ...createMobileResourcePageState(),
  folderContextMenuItems: createFolderContextMenuItems(),
  itemContextMenuItems: createItemContextMenuItems(),
  emptyContextMenuItems: createEmptyContextMenuItems(),
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

export const setSelectedItemId = (
  { state },
  { itemId, suppressMobileDetailSheet = false } = {},
) => {
  state.selectedItemId = itemId;
  setMobileResourceDetailSheetSuppressedState(state, {
    itemId,
    suppressMobileDetailSheet,
  });
  if (itemId !== undefined) {
    state.selectedFolderId = undefined;
  }
  state.isDetailTagSelectOpen = false;
  syncDetailTagIds({
    state,
    item: selectVariableItem(state, itemId),
  });
};

export const selectIsTouchMode = selectIsTouchModeState;

export const selectIsMobileFileExplorerOpen =
  selectIsMobileFileExplorerOpenState;

export const selectSuppressMobileDetailSheet =
  selectSuppressMobileDetailSheetState;

export const setSelectedFolderId = ({ state }, { folderId } = {}) => {
  state.selectedFolderId = folderId;
  if (folderId !== undefined) {
    state.selectedItemId = undefined;
    setMobileResourceDetailSheetSuppressedState(state, {
      itemId: undefined,
    });
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
    description: defaultValues?.description ?? "",
  };
};

export const closeFolderNameDialog = ({ state }, _payload = {}) => {
  state.isFolderNameDialogOpen = false;
  state.folderNameDialogItemId = undefined;
  state.folderNameDialogDefaultValues = {
    name: "",
    description: "",
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

export const selectVariableItemById = ({ state }, { itemId } = {}) =>
  selectVariableItem(state, itemId);

export const selectVariableTreeItemById = ({ state }, { itemId } = {}) =>
  state.variablesData?.items?.[itemId];

export const selectFolderNameDialogItemId = ({ state }) =>
  state.folderNameDialogItemId;

export const selectTagsData = selectTagsDataState;

export const selectActiveTagIds = selectActiveTagIdsState;

export const selectDetailTagIds = selectDetailTagIdsState;

export const selectCreateTagContext = selectCreateTagContextState;

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return undefined;
  return selectVariableItem(state, state.selectedItemId);
};

export const selectFolderById = ({ state }, { folderId } = {}) => {
  const item = state.variablesData?.items?.[folderId];
  return item?.type === "folder" ? item : undefined;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectVariablesPageCopy(i18n);
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
    selectedVariableDefault = getBooleanLabel(selectedItem.default, copy);
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
        label: copy.tagsLabel ?? "Tags",
      },
      {
        type: "text",
        label: copy.scopeLabel ?? "Scope",
        value: getScopeLabel(selectedItem.scope, copy),
      },
      {
        type: "text",
        label: copy.typeLabel ?? "Type",
        value: getVariableTypeLabel(selectedItem.variableType, copy),
      },
    );

    if (selectedItemIsEnum) {
      detailFields.push(
        {
          type: "text",
          label: copy.enumLabel ?? "Enum",
          value: copy.yesLabel ?? "Yes",
        },
        {
          type: "text",
          label: copy.valuesLabel ?? "Values",
          value: selectedEnumValues.join(", "),
        },
      );
    }

    detailFields.push({
      type: "text",
      label: copy.defaultLabel ?? "Default",
      value: selectedVariableDefault,
    });
  } else if (selectedFolder?.type === "folder") {
    detailFields.push(
      {
        type: "text",
        label: copy.typeLabel ?? "Type",
        value: copy.folderTypeValue ?? "folder",
      },
      {
        type: "description",
        value: selectedFolder.description ?? "",
      },
    );
  }

  return {
    flatItems,
    flatGroups,
    title: copy.title ?? "Variables",
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
      createTagFormDefinition: createTagForm({
        title: copy.createTagTitle,
        submitLabel: copy.createTagButton,
        nameLabel: copy.tagNameLabel,
      }),
      tagFilterPlaceholder: copy.tagFilterPlaceholder ?? "Filter tags",
      detailTagAddOptionLabel: copy.addTagOption ?? "Add tag",
    }),
    folderContextMenuItems: createFolderContextMenuItems(copy),
    itemContextMenuItems: createItemContextMenuItems(copy),
    emptyContextMenuItems: createEmptyContextMenuItems(copy),
    isFolderNameDialogOpen: state.isFolderNameDialogOpen,
    folderNameDialogItemId: state.folderNameDialogItemId,
    folderNameForm: createFolderNameForm(copy),
    folderNameDialogDefaultValues: state.folderNameDialogDefaultValues,
    addTagPlaceholder: copy.addTagPlaceholder ?? "Add tag",
    deleteButton: copy.deleteButton ?? "Delete",
    filesLabel: copy.filesLabel ?? "Files",
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
  };
};
