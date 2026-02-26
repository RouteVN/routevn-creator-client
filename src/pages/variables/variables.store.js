import { toFlatGroups, toFlatItems } from "#v2-tree-helpers";

const form = {
  fields: [
    { name: "name", type: "popover-input", label: "Name" },
    {
      name: "scope",
      type: "read-only-text",
      label: "Scope",
      content: "${scope}",
    },
    {
      name: "type",
      type: "read-only-text",
      label: "Type",
      content: "${type}",
    },
    {
      name: "default",
      type: "read-only-text",
      label: "Default",
      content: "${default}",
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

export const setItems = ({ state }, { variablesData } = {}) => {
  state.variablesData = variablesData;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.variablesData);
  return flatItems.find((item) => item.id === state.selectedItemId) || null;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.variablesData);
  const flatGroups = toFlatGroups(state.variablesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  let formContext = {
    scope: "",
    type: "",
    default: "",
  };

  if (selectedItem) {
    let defaultValue = selectedItem.default ?? "";
    // Convert boolean to string for form display
    if (typeof defaultValue === "boolean") {
      defaultValue = defaultValue ? "true" : "false";
    }
    defaultValues = {
      name: selectedItem.name,
      scope: selectedItem.scope || "",
      type: selectedItem.type || "",
      default: defaultValue,
    };

    formContext = {
      scope: selectedItem.scope || "",
      type: selectedItem.type || "",
      default: defaultValue,
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
    context: formContext,
    defaultValues,
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
  };
};
