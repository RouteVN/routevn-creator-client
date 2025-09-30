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

export const INITIAL_STATE = Object.freeze({
  spritesData: { tree: [], items: {} },
  selectedItemId: undefined,
  characterId: undefined,
  context: {
    fileId: {
      src: "",
    },
  },
  searchQuery: "",
  collapsedIds: [],
  zoomLevel: 1.0,
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

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const setZoomLevel = (state, zoomLevel) => {
  const newZoomLevel = Math.max(0.5, Math.min(4.0, zoomLevel));
  if (Math.abs(state.zoomLevel - newZoomLevel) < 0.001) return;
  state.zoomLevel = newZoomLevel;
};

export const showFullImagePreview = (state, fileId) => {
  state.fullImagePreviewVisible = true;
  state.fullImagePreviewFileId = fileId;
};

export const hideFullImagePreview = (state) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const selectCurrentZoomLevel = ({ state }) => state.zoomLevel;

export const selectCharacterId = ({ state }) => {
  return state.characterId;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  // state.spritesData contains the full structure with tree and items
  if (!state.spritesData || !state.spritesData.items || !state.spritesData.tree)
    return null;
  const flatItems = toFlatItems(state.spritesData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.spritesData);
  const rawFlatGroups = toFlatGroups(state.spritesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  // Transform selectedItem into form defaults
  let defaultValues = {};

  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
      typeDisplay: selectedItem.type === "image" ? "Sprite" : "Folder",
      displayFileType:
        selectedItem.fileType || (selectedItem.type === "image" ? "PNG" : ""),
      displayFileSize: selectedItem.fileSize
        ? formatFileSize(selectedItem.fileSize)
        : "",
      fullPath: selectedItem.fullLabel || selectedItem.name || "",
    };
  }

  // Apply search filter
  const searchQuery = state.searchQuery.toLowerCase().trim();
  let filteredGroups = rawFlatGroups;

  if (searchQuery) {
    filteredGroups = rawFlatGroups
      .map((group) => {
        const filteredChildren = (group.children || []).filter((item) => {
          const name = (item.name || "").toLowerCase();
          return name.includes(searchQuery);
        });

        const groupName = (group.name || "").toLowerCase();
        const shouldIncludeGroup =
          filteredChildren.length > 0 || groupName.includes(searchQuery);

        return shouldIncludeGroup
          ? {
              ...group,
              children: filteredChildren,
              hasChildren: filteredChildren.length > 0,
            }
          : null;
      })
      .filter(Boolean);
  }

  // Calculate zoom-based dimensions
  const baseHeight = 150;
  const imageHeight = Math.round(baseHeight * state.zoomLevel);
  const maxWidth = Math.round(400 * state.zoomLevel);

  // Apply collapsed state and selection styling
  const flatGroups = filteredGroups.map((group) => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id)
      ? []
      : (group.children || []).map((item) => ({
          ...item,
          height: imageHeight,
          maxWidth: maxWidth,
          selectedStyle:
            item.id === state.selectedItemId
              ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
              : "",
        })),
  }));

  return {
    flatItems,
    flatGroups,
    resourceCategory: "assets",
    selectedResourceId: "character-sprites",
    selectedItemId: state.selectedItemId,
    repositoryTarget: `characters.items.${state.characterId}.sprites`,
    form,
    context: state.context,
    defaultValues,
    searchQuery: state.searchQuery,
    resourceType: "images",
    searchPlaceholder: "Search sprites...",
    uploadText: "Upload Sprite",
    acceptedFileTypes: [".png", ".jpg", ".jpeg", ".gif", ".webp"],
    zoomLevel: state.zoomLevel,
    imageHeight,
    maxWidth,
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
  };
};
