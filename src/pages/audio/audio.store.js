import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      name: "waveformDataFileId",
      inputType: "audio",
      width: 240,
      height: 100,
    },
    { name: "name", inputType: "popover-input", label: "Name" },
    { name: "fileType", inputType: "read-only-text", label: "File Type" },
    {
      name: "fileSize",
      inputType: "read-only-text",
      label: "File Size",
    },
    {
      name: "duration",
      inputType: "read-only-text",
      label: "Duration",
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  audioData: { tree: [], items: {} },
  selectedItemId: null,
  fieldResources: {},
});

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const setItems = (state, audioData) => {
  state.audioData = audioData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.audioData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const toViewData = ({ state }) => {
  const flatItems = toFlatItems(state.audioData);
  const flatGroups = toFlatGroups(state.audioData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      fileType: selectedItem.fileType,
      fileSize: formatFileSize(selectedItem.fileSize),
      duration: selectedItem.duration
        ? `${Math.floor(selectedItem.duration / 60).toString()}:${Math.floor(
            selectedItem.duration % 60,
          )
            .toString()
            .padStart(2, "0")}`
        : "Unknown",
    };
  }

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "audio",
    selectedItemId: state.selectedItemId,
    repositoryTarget: "audio",
    form,
    defaultValues,
    fieldResources: state.fieldResources,
  };
};
