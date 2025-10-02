import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { formatFileSize } from "../../utils/index.js";

const form = {
  fields: [
    {
      name: "fileId",
      inputType: "image",
      src: "${fileId.src}",
      height: 135,
    },
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "typeDisplay", inputType: "read-only-text", description: "Type" },
    {
      name: "displayFileType",
      inputType: "read-only-text",
      description: "File Type",
    },
    {
      name: "displayFileSize",
      inputType: "read-only-text",
      description: "File Size",
    },
  ],
};

export const createInitialState = () => ({
  spritesData: { tree: [], items: {} },
  selectedItemId: undefined,
  characterId: undefined,
  context: {
    fileId: {
      src: "",
    },
  },
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
});

export const setContext = (state, context) => {
  state.context = context;
};

export const setItems = (state, spritesData) => {
  state.spritesData = spritesData;
};

export const setCharacterId = (state, characterId) => {
  state.characterId = characterId;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

