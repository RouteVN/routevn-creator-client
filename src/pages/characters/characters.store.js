import { toFlatGroups, toFlatItems } from "../../deps/repository";

const form = {
  fields: [
    {
      name: "fileId",
      inputType: "image",
      src: "${fileId.src}",
      width: 240,
      clickable: true,
      extraEvent: true,
    },
    { name: "name", inputType: "popover-input", description: "Name" },
    {
      name: "description",
      inputType: "popover-input",
      description: "Description",
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  charactersData: { tree: [], items: {} },
  selectedItemId: null,
  context: {
    fileId: {
      src: "",
    },
  },
});

export const setContext = (state, context) => {
  state.context = context;
};

export const setItems = (state, charactersData) => {
  state.charactersData = charactersData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.charactersData contains the full structure with tree and items
  const flatItems = toFlatItems(state.charactersData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.charactersData);
  const flatGroups = toFlatGroups(state.charactersData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      description: selectedItem.description || "No description provided",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "characters",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "characters",
    form,
    context: state.context,
    defaultValues,
  };
};
