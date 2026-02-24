import { toFlatGroups } from "#domain-structure";

export const createInitialState = () => ({
  selectedImageId: undefined,
  images: { items: {}, order: [] }, // Add this - raw repository images data
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

export const selectViewData = ({ state }) => {
  const images = state.images || { items: {}, order: [] }; // Raw data from state
  const selectedImageId = state.selectedImageId; // Use state instead of props

  // Process images into groups here, like in commandLineBackground
  const groups = toFlatGroups(images).map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === selectedImageId;
        return {
          ...child,
          bw: isSelected ? "md" : "xs",
          bc: isSelected ? "pr" : "mu",
          selectedStyle: isSelected
            ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
            : "",
        };
      }),
    };
  });

  return {
    groups: groups, // Processed groups for template
    selectedImageId: selectedImageId,
  };
};
