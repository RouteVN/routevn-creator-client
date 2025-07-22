import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  layoutsData: { tree: [], items: {} },
  selectedItemId: null,
});

export const setItems = (state, layoutsData) => {
  state.layoutsData = layoutsData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.layoutsData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => state.selectedItemId;

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.layoutsData);
  const flatGroups = toFlatGroups(state.layoutsData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Compute display values for selected item
  const selectedItemDetails = selectedItem
    ? {
        ...selectedItem,
        typeDisplay: selectedItem.type === "layout" ? "Layout" : "Folder",
        fullPath: selectedItem.fullLabel || selectedItem.name || "",
      }
    : null;

  // Transform selectedItem into detailPanel props
  const detailTitle = selectedItemDetails ? "Layout Details" : null;
  const detailFields = selectedItemDetails
    ? [
        {
          type: "text",
          label: "Name",
          value: selectedItemDetails.name,
          name: "name",
          editable: true,
        },
        { type: "text", label: "Type", value: selectedItemDetails.typeDisplay },
        {
          type: "text",
          label: "Path",
          value: selectedItemDetails.fullPath,
          size: "sm",
        },
      ]
    : [];
  const detailEmptyMessage = "Select a layout to view details";

  return {
    flatItems,
    flatGroups,
    resourceCategory: "userInterface",
    selectedResourceId: "layouts",
    selectedItemId: state.selectedItemId,
    selectedItem: selectedItemDetails,
    detailTitle,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: "layouts",
  };
};
