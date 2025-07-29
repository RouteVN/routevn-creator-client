import { toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  searchQuery: "",
  colorsData: {
    items: {},
    tree: [],
  },
  fontsData: {
    items: {},
    tree: [],
  },
});

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const setColorsData = (state, colorsData) => {
  state.colorsData = colorsData;
};

export const setFontsData = (state, fontsData) => {
  state.fontsData = fontsData;
};

export const toViewData = ({ state, props }, payload) => {
  const selectedItemId = props.selectedItemId;
  const searchQuery = state.searchQuery.toLowerCase();

  const getColorHex = (colorId) => {
    if (!colorId) return "#000000";
    const color = toFlatItems(state.colorsData)
      .filter((item) => item.type === "color")
      .find((color) => color.id === colorId);
    return color ? color.hex : "#000000";
  };

  const getFontData = (fontId) => {
    if (!fontId) return { fontFamily: null, fileId: null };
    const font = toFlatItems(state.fontsData)
      .filter((item) => item.type === "font")
      .find((font) => font.id === fontId);
    return font
      ? { fontFamily: font.fontFamily, fileId: font.fileId }
      : { fontFamily: fontId, fileId: null };
  };

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name || "").toLowerCase();
    const fontSize = (item.fontSize || "").toString().toLowerCase();
    const lineHeight = (item.lineHeight || "").toString().toLowerCase();
    const fontColor = (item.fontColor || "").toLowerCase();
    const fontWeight = (item.fontWeight || "").toLowerCase();

    return (
      name.includes(searchQuery) ||
      fontSize.includes(searchQuery) ||
      lineHeight.includes(searchQuery) ||
      fontColor.includes(searchQuery) ||
      fontWeight.includes(searchQuery)
    );
  };

  // Apply collapsed state and search filtering to flatGroups
  const flatGroups = (props.flatGroups || [])
    .map((group) => {
      // Filter children based on search query
      const filteredChildren = (group.children || []).filter(matchesSearch);

      // Only show groups that have matching children or if there's no search query
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      return {
        ...group,
        isCollapsed: state.collapsedIds.includes(group.id),
        children: state.collapsedIds.includes(group.id)
          ? []
          : filteredChildren.map((item) => {
              const fontData = getFontData(item.fontId);
              return {
                ...item,
                fontStyle: fontData.fontFamily,
                fontFileId: fontData.fileId,
                color: getColorHex(item.colorId),
                previewText:
                  item.previewText ||
                  "The quick brown fox jumps over the lazy dog",
                selectedStyle:
                  item.id === selectedItemId
                    ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
                    : "",
              };
            }),
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    uploadText: "Upload Typography Files",
    searchQuery: state.searchQuery,
  };
};
