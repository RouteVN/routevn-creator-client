export const INITIAL_STATE = Object.freeze({
  selectedTypographyId: undefined,
  searchQuery: "",
});

export const selectSelectedTypographyId = ({ state }) => {
  return state.selectedTypographyId;
};

export const setSelectedTypographyId = (state, payload) => {
  state.selectedTypographyId = payload.typographyId;
};

export const setSearchQuery = (state, payload) => {
  state.searchQuery = payload.query;
};

export const toViewData = ({ state, props }, payload) => {
  const groups = props.groups || [];
  const selectedTypographyId = props.selectedTypographyId;
  const searchQuery = state.searchQuery || "";
  const colorsData = props.colorsData || { items: {} };
  const fontsData = props.fontsData || { items: {} };

  const processedGroups = groups
    .map((group) => {
      const filteredChildren = group.children.filter((child) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          child.name.toLowerCase().includes(query) ||
          child.fontSize.toString().includes(query) ||
          child.lineHeight.toString().includes(query) ||
          child.fontWeight.includes(query)
        );
      });

      return {
        ...group,
        children: filteredChildren.map((child) => {
          const isSelected = child.id === selectedTypographyId;
          const colorItem = colorsData.items[child.colorId];
          const fontItem = fontsData.items[child.fontId];

          return {
            ...child,
            bw: isSelected ? "md" : "xs",
            fontStyle: fontItem?.name || "Arial",
            color: colorItem?.hex || "#ffffff",
            fontFileId: fontItem?.fileId,
          };
        }),
      };
    })
    .filter((group) => group.children.length > 0);

  return {
    groups: processedGroups,
    selectedTypographyId,
    searchQuery,
  };
};
