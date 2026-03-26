import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { createSystemVariablesData } from "../../internal/systemVariables.js";

const SYSTEM_VARIABLES_DATA = createSystemVariablesData();

export const createInitialState = () => ({
  selectedItemId: undefined,
});

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) {
    return undefined;
  }

  const flatItems = toFlatItems(SYSTEM_VARIABLES_DATA);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(SYSTEM_VARIABLES_DATA);
  const flatGroups = toFlatGroups(SYSTEM_VARIABLES_DATA);
  const selectedItem = selectSelectedItem({ state });

  let selectedVariableDefault = "";
  if (typeof selectedItem?.default === "boolean") {
    selectedVariableDefault = selectedItem.default ? "true" : "false";
  } else if (selectedItem?.default !== undefined) {
    selectedVariableDefault = String(selectedItem.default);
  }

  const detailFields = selectedItem
    ? [
        {
          type: "description",
          value: selectedItem.description ?? "",
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
    selectedResourceId: "systemVariables",
    selectedItemId: state.selectedItemId,
    selectedItemName: selectedItem?.name ?? "",
    detailFields,
  };
};
