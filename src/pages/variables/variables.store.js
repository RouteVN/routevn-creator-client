import { toFlatGroups, toFlatItems } from "#insieme-compat";

const createForm = (selectedItem) => ({
  fields: [
    { name: "name", type: "popover-input", description: "Name" },
    {
      name: "scope",
      type: "select",
      description: "Scope",
      options: [
        { value: "context", label: "Context" },
        { value: "global-device", label: "Global Device" },
        { value: "global-account", label: "Global Account" },
      ],
    },
    {
      name: "type",
      type: "select",
      description: "Type",
      options: [
        { value: "string", label: "String" },
        { value: "number", label: "Number" },
        { value: "boolean", label: "Boolean" },
      ],
    },
    selectedItem?.type === "boolean"
      ? {
          name: "default",
          type: "select",
          description: "Default",
          options: [
            { value: "true", label: "True" },
            { value: "false", label: "False" },
          ],
        }
      : selectedItem?.type === "number"
        ? {
            name: "default",
            type: "input-number",
            description: "Default",
          }
        : {
            name: "default",
            type: "input-text",
            description: "Default",
          },
  ],
});

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

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.variablesData);
  const flatGroups = toFlatGroups(state.variablesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
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
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "systemConfig",
    selectedResourceId: "variables",
    repositoryTarget: "variables",
    selectedItemId: state.selectedItemId,
    form: createForm(selectedItem),
    defaultValues,
    contextMenuItems: state.contextMenuItems,
    emptyContextMenuItems: state.emptyContextMenuItems,
  };
};
