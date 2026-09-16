import { selectResourceSelectorEmptyMessage } from "../../internal/ui/resourcePages/selectorEmptyState.js";
import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { buildCharacterSpritePreviewLayer } from "../../internal/characterSpritePreview.js";

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

const parseColumnCount = (value) => {
  const columns = Number(value);
  return Number.isInteger(columns) && columns > 0 ? columns : undefined;
};

export const selectViewData = ({ state, props = {}, i18n = {} }) => {
  const images = state.images ?? { items: {}, tree: [] };
  const selectedImageId = state.selectedImageId;
  const searchQuery = (props.searchQuery ?? "").toLowerCase().trim();
  const columns = parseColumnCount(props.columns);
  let imageSelectorLabel = i18n.imagesPage?.title ?? "Images";
  if (props.resourceTarget === "characters") {
    imageSelectorLabel = i18n.charactersPage.title;
  } else if (props.resourceTarget === "characterSprites") {
    imageSelectorLabel = i18n.characterSpritesPage.title;
  }
  const imageGridStyle = columns
    ? `display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr));`
    : "";

  const resourceGroups = toFlatGroups(images);
  const rootItems = toFlatItems(images).filter(
    (item) => !item.parentId && item.type !== "folder",
  );
  if (rootItems.length > 0) {
    resourceGroups.unshift({
      id: "image-selector-root",
      fullLabel: imageSelectorLabel,
      children: rootItems,
    });
  }
  const groups = resourceGroups
    .map((group) => {
      const children = group.children
        .filter(
          (child) =>
            matchesSearch(child, searchQuery) ||
            matchesSearch(group, searchQuery),
        )
        .map((child) => {
          const isSelected = child.id === selectedImageId;
          const itemBorderColor = isSelected ? "pr" : "bo";
          const itemHoverBorderColor = isSelected ? "pr" : "ac";
          const selectedImageInsetStyle = isSelected
            ? " box-shadow: inset 0 0 0 1px var(--color-pr);"
            : "";
          const imageCardStyle = `width: ${columns ? "100%" : "200px"}; min-width: 0; max-width: 100%; box-sizing: border-box;${selectedImageInsetStyle}`;

          return {
            ...child,
            isSelected,
            itemBorderColor,
            itemHoverBorderColor,
            imageCardStyle,
            previewAspectRatio: "16 / 9",
            preview: buildCharacterSpritePreviewLayer(child),
            thumbnailFileId: child.thumbnailFileId ?? child.fileId,
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
    selectorEmptyMessage: selectResourceSelectorEmptyMessage({
      groups: groups,
      searchQuery: searchQuery,
      i18n,
    }),
    imageGridStyle,
    imageSelectorLabel,
    noAvatarLabel: i18n.charactersPage?.noAvatarLabel,
    selectedImageId,
  };
};
