import { toFlatGroups, toFlatItems } from "../../domain/treeHelpers.js";

const EMPTY_TREE = { tree: [], items: {} };

const folderContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-child-folder" },
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const itemContextMenuItems = [
  { label: "Duplicate", type: "item", value: "duplicate-item" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const emptyContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-item" },
];

const centerItemContextMenuItems = [
  { label: "Delete", type: "item", value: "delete-item" },
];

const form = {
  fields: [
    {
      name: "fileId",
      type: "image",
      width: 240,
      clickable: true,
      extraEvent: true,
    },
    { name: "name", type: "popover-input", label: "Name" },
    {
      name: "description",
      type: "popover-input",
      label: "Description",
    },
  ],
};

const createDetailValues = (item, imageSrc) => ({
  fileId: imageSrc,
  name: item?.name ?? "",
  description: item?.description ?? "",
});

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();

  return name.includes(searchQuery) || description.includes(searchQuery);
};

export const createInitialState = () => ({
  spritesData: EMPTY_TREE,
  selectedItemId: undefined,
  characterId: undefined,
  characterName: undefined,
  context: {
    fileId: {
      src: undefined,
    },
  },
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
});

export const setContext = ({ state }, { context } = {}) => {
  state.context = context;
};

export const setItems = ({ state }, { spritesData } = {}) => {
  state.spritesData = spritesData ?? EMPTY_TREE;
};

export const setCharacterId = ({ state }, { characterId } = {}) => {
  state.characterId = characterId;
};

export const setCharacterName = ({ state }, { characterName } = {}) => {
  state.characterName = characterName;
};

export const clearCharacterSpritesView = ({ state }) => {
  state.characterName = undefined;
  state.spritesData = EMPTY_TREE;
  state.selectedItemId = undefined;
  state.context = {
    fileId: {
      src: undefined,
    },
  };
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query ?? "";
};

export const selectSelectedItem = ({ state }) => {
  const item = state.spritesData.items?.[state.selectedItemId];
  return item?.type === "image" ? item : undefined;
};

export const selectSpriteItemById = ({ state }, { itemId } = {}) => {
  const item = state.spritesData.items?.[itemId];
  return item?.type === "image" ? item : undefined;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectCharacterId = ({ state }) => {
  return state.characterId;
};

export const selectPreviewImageSrc = ({ state }) => {
  return state.context?.fileId?.src;
};

export const showFullImagePreview = ({ state }, { itemId } = {}) => {
  const item = state.spritesData.items?.[itemId];

  if (item?.fileId) {
    state.fullImagePreviewVisible = true;
    state.fullImagePreviewFileId = item.fileId;
  }
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.spritesData);
  const rawFlatGroups = toFlatGroups(state.spritesData);
  const searchQuery = state.searchQuery.toLowerCase().trim();

  const mediaGroups = rawFlatGroups
    .map((group) => {
      const children = (group.children ?? []).filter((item) =>
        matchesSearch(item, searchQuery),
      );
      const shouldDisplay = !searchQuery || children.length > 0;

      return {
        ...group,
        children: children.map((item) => ({
          ...item,
          cardKind: "image",
          imageFileId: item.fileId,
        })),
        hasChildren: children.length > 0,
        shouldDisplay,
      };
    })
    .filter((group) => group.shouldDisplay);

  const selectedItem = state.spritesData.items?.[state.selectedItemId];

  return {
    flatItems,
    mediaGroups,
    resourceCategory: "assets",
    selectedResourceId: "characterSprites",
    selectedItemId: state.selectedItemId,
    form,
    context: state.context,
    defaultValues: createDetailValues(
      selectedItem?.type === "image" ? selectedItem : undefined,
      state.context.fileId.src,
    ),
    searchQuery: state.searchQuery,
    uploadText: "Upload Sprite",
    acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp"],
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    folderContextMenuItems,
    itemContextMenuItems,
    emptyContextMenuItems,
    centerItemContextMenuItems,
    title: state.characterName,
  };
};
