import { toFlatGroups } from "../../internal/project/tree.js";

export const createInitialState = () => ({
  selectedImageId: undefined,
  images: { items: {}, tree: [] }, // Add this - raw repository images data
});

export const selectSelectedImageId = ({ state }) => {
  return state.selectedImageId;
};

export const setSelectedImageId = ({ state }, { imageId } = {}) => {
  state.selectedImageId = imageId;
};

export const selectImages = ({ state }) => {
  return state.images;
};

export const setImages = ({ state }, { images } = {}) => {
  state.images = images;
};

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  return name.includes(searchQuery) || description.includes(searchQuery);
};

export const selectViewData = ({ state, props = {} }) => {
  const images = state.images || { items: {}, tree: [] }; // Raw data from state
  const selectedImageId = state.selectedImageId; // Use state instead of props
  const searchQuery = (props.searchQuery ?? "").toLowerCase().trim();

  // Process images into groups here, like in commandLineBackground
  const groups = toFlatGroups(images)
    .map((group) => {
      const children = group.children
        .filter((child) => matchesSearch(child, searchQuery))
        .map((child) => {
          const isSelected = child.id === selectedImageId;
          const itemBorderColor = isSelected ? "pr" : "bo";
          const itemHoverBorderColor = isSelected ? "pr" : "ac";
          return {
            ...child,
            itemBorderColor,
            itemHoverBorderColor,
          };
        });

      return {
        ...group,
        children,
        hasChildren: children.length > 0,
        shouldDisplay: !searchQuery || children.length > 0,
      };
    })
    .filter((group) => group.shouldDisplay);

  return {
    groups: groups, // Processed groups for template
    selectedImageId: selectedImageId,
  };
};
