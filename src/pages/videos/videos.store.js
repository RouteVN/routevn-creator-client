import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      name: "thumbnailFileId",
      inputType: "image",
      width: 240,
      height: 135,
    },
    { name: "name", inputType: "popover-input", label: "Name" },
    { name: "fileType", inputType: "read-only-text", label: "File Type" },
    {
      name: "fileSize",
      inputType: "read-only-text",
      label: "File Size",
    },
  ],
};

export const INITIAL_STATE = Object.freeze({
  videosData: { tree: [], items: {} },
  selectedItemId: null,
  fieldResources: {},
});

export const setItems = (state, videosData) => {
  state.videosData = videosData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const setFieldResources = (state, resources) => {
  state.fieldResources = resources;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.videosData contains the full structure with tree and items
  const flatItems = toFlatItems(state.videosData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const toViewData = ({ state }) => {
  const flatItems = toFlatItems(state.videosData);
  const flatGroups = toFlatGroups(state.videosData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into detailPanel props
  let detailFields;
  let defaultValues = {};

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      fileType: selectedItem.fileType,
      fileSize: formatFileSize(selectedItem.fileSize),
    };

    detailFields = [
      {
        type: "image",
        fileId: selectedItem.thumbnailFileId,
        width: 240,
        height: 135,
        editable: true,
        accept: "video/*",
        eventType: "video-file-selected",
      },
      { id: "name", type: "text", value: selectedItem.name, editable: true },
      { type: "text", label: "File Type", value: selectedItem.fileType },
      {
        type: "text",
        label: "File Size",
        value: formatFileSize(selectedItem.fileSize),
      },
    ];
  }

  const detailEmptyMessage = "No selection";

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "videos",
    selectedItemId: state.selectedItemId,
    detailTitle: undefined,
    detailFields,
    detailEmptyMessage,
    repositoryTarget: "videos",
    form,
    defaultValues,
    fieldResources: state.fieldResources,
  };
};
