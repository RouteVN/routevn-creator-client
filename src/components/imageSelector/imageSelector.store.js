export const createInitialState = () => ({
  selectedImageId: undefined,
});

export const selectSelectedImageId = ({ state }) => {
  return state.selectedImageId;
};

export const setSelectedImageId = (state, payload) => {
  state.selectedImageId = payload.imageId;
};

export const selectViewData = ({ state, props }, payload) => {
  const groups = props.groups || [];
  const selectedImageId = props.selectedImageId;

  const processedGroups = groups.map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === selectedImageId;
        return {
          ...child,
          bw: isSelected ? "md" : "",
        };
      }),
    };
  });

  return {
    groups: processedGroups,
  };
};
