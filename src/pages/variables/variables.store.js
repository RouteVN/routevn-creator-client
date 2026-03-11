import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";

export const createInitialState = () => ({
  variablesData: { tree: [], items: {} },
  selectedItemId: undefined,
  contextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  emptyContextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
  ],
});

export const setItems = ({ state }, { variablesData } = {}) => {
  state.variablesData = variablesData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return undefined;
  const flatItems = toFlatItems(state.variablesData);
  return flatItems.find((item) => item.id === state.selectedItemId);
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

  const detailFields = selectedItem
    ? [
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
        {
          type: "text",
          label: "Default",
          value: selectedVariableDefault,
        },
      ]
    : [];

  return {
    flatItems,
    flatGroups,
    resourceCategory: "systemConfig",
    selectedResourceId: "variables",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    detailFields,
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
  };
};
