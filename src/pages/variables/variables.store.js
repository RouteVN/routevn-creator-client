import { toFlatGroups, toFlatItems } from "insieme";

const form = {
  fields: [
    { name: "name", inputType: "popover-input", label: "Name" },
    {
      name: "scope",
      inputType: "popover-input",
      label: "Scope",
    },
    {
      name: "type",
      inputType: "popover-input",
      label: "Type",
    },
    {
      name: "default",
      inputType: "popover-input",
      label: "Default",
    },
  ],
};

export const createInitialState = () => ({
  variablesData: { tree: [], items: {} },
  selectedItemId: null,
  contextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
    { label: "Rename", type: "item", value: "rename-item" },
    { label: "Delete", type: "item", value: "delete-item" },
  ],
  emptyContextMenuItems: [
    { label: "New Folder", type: "item", value: "new-item" },
  ],
});

export const setItems = (state, variablesData) => {
  state.variablesData = variablesData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.variablesData);
  const flatGroups = toFlatGroups(state.variablesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      scope: selectedItem.scope || "",
      type: selectedItem.type || "",
      default: selectedItem.default ?? "",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "systemConfig",
    selectedResourceId: "variables",
    repositoryTarget: "variables",
    selectedItemId: state.selectedItemId,
    form,
    defaultValues,
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
  };
};
