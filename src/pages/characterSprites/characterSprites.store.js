import { toFlatGroups, toFlatItems } from "insieme";

const form = {
  fields: [
    {
      name: "fileId",
      type: "image",
      src: "${fileId.src}",
      width: 240,
      clickable: true,
      extraEvent: true,
    },
    { name: "name", type: "popover-input", description: "Name" },
    {
      name: "description",
      type: "popover-input",
      description: "Description",
    },
  ],
};

export const createInitialState = () => ({
  spritesData: { tree: [], items: {} },
  selectedItemId: undefined,
  characterId: undefined,
  characterName: undefined,
  context: {
    fileId: {
      src: "",
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
  state.spritesData = spritesData;
};

export const setCharacterId = ({ state }, { characterId } = {}) => {
  state.characterId = characterId;
};

export const setCharacterName = ({ state }, { characterName } = {}) => {
  state.characterName = characterName;
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
};

export const selectSelectedItem = ({ state }) => {
  if (!state.selectedItemId) return null;
  const flatItems = toFlatItems(state.spritesData);
  return flatItems.find((item) => item.id === state.selectedItemId);
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const selectCharacterId = ({ state }) => {
  return state.characterId;
};

export const selectFlatItems = ({ state }) => {
  return toFlatItems(state.spritesData);
};

export const showFullImagePreview = ({ state }, { itemId } = {}) => {
  const flatItems = toFlatItems(state.spritesData);
  const item = flatItems.find((item) => item.id === itemId);

  if (item && item.fileId) {
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

  // Apply search filter
  const searchQuery = state.searchQuery.toLowerCase().trim();
  let filteredGroups = rawFlatGroups;

  if (searchQuery) {
    filteredGroups = rawFlatGroups
      .map((group) => {
        const filteredChildren = (group.children || []).filter((item) => {
          const name = (item.name || "").toLowerCase();
          const description = (item.description || "").toLowerCase();
          return (
            name.includes(searchQuery) || description.includes(searchQuery)
          );
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

  // Apply collapsed state and selection styling
  const flatGroups = filteredGroups.map((group) => ({
    ...group,
    children: (group.children || []).map((item) => ({
      ...item,
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
    selectedResourceId: "characterSprites",
    selectedItemId: state.selectedItemId,
    repositoryTarget: `characters.items.${state.characterId}.sprites`,
    form,
    context: state.context,
    defaultValues,
    searchQuery: state.searchQuery,
    resourceType: "characterSprites",
    acceptedFileTypes: [".jpg", ".jpeg", ".png", ".webp"],
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    title: state.characterName,
    backUrl: "/project/resources/characters",
  };
};
