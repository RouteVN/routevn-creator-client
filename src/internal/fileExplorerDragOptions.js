export const canItemReceiveChildren = (item) => {
  return item?.type === "folder" || item?.dragOptions?.canReceiveChildren === true;
};

export const applyFolderRequiredRootDragOptions = (items = []) => {
  return (items ?? []).map((item) => ({
    ...item,
    dragOptions: {
      ...item.dragOptions,
      canMoveToRoot: item.type === "folder",
    },
  }));
};
