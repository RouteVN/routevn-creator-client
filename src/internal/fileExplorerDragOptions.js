export const applyFolderRequiredRootDragOptions = (items = []) => {
  return (items ?? []).map((item) => ({
    ...item,
    dragOptions: {
      ...item.dragOptions,
      canMoveToRoot: item.type === "folder",
    },
  }));
};
