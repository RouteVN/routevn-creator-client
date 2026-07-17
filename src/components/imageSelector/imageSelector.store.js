import { toFlatGroups } from "../../internal/project/tree.js";

export const createInitialState = () => ({
  selectedImageId: undefined,
  images: { items: {}, tree: [] },
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

export const selectViewData = ({ state, props = {}, i18n = {} }) => {
  const images = state.images ?? { items: {}, tree: [] };
  const selectedImageId = state.selectedImageId;
  const searchQuery = (props.searchQuery ?? "").toLowerCase().trim();

  const groups = toFlatGroups(images)
    .map((group) => {
      const children = group.children
        .filter((child) => matchesSearch(child, searchQuery))
        .map((child) => {
          const isSelected = child.id === selectedImageId;
          const itemBorderColor = isSelected ? "pr" : "bo";
          const itemHoverBorderColor = isSelected ? "pr" : "ac";
          const selectedImageInsetStyle = isSelected
            ? " box-shadow: inset 0 0 0 1px var(--color-pr);"
            : "";
          const imageCardStyle = `max-width: 100%; box-sizing: border-box;${selectedImageInsetStyle}`;

          return {
            ...child,
            isSelected,
            itemBorderColor,
            itemHoverBorderColor,
            imageCardStyle,
            previewAspectRatio: "16 / 9",
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
    groups,
    imageSelectorLabel: i18n.imagesPage?.title ?? "Images",
    selectedImageId,
  };
};
