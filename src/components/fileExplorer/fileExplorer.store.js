// Simple passthrough store - just returns props
export const createInitialState = () => ({});

export const selectViewData = ({ props }) => {
  return {
    items: props.items || [],
    contextMenuItems: props.contextMenuItems,
    emptyContextMenuItems: props.emptyContextMenuItems,
  };
};
