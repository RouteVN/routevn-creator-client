// Simple passthrough store - just returns props
export const INITIAL_STATE = Object.freeze({});

export const toViewData = ({ state, props }, payload) => {
  return {
    items: props.items || [],
    contextMenuItems: props.contextMenuItems,
    emptyContextMenuItems: props.emptyContextMenuItems,
  };
};
