// Simple passthrough store - just returns props
export const createInitialState = () => ({
  deleteWarningVisible: false,
  deleteWarningItemId: undefined,
  deleteWarningUsage: null,
});

export const showDeleteWarning = (state, { itemId, usage }) => {
  state.deleteWarningVisible = true;
  state.deleteWarningItemId = itemId;
  state.deleteWarningUsage = usage;
};

export const hideDeleteWarning = (state) => {
  state.deleteWarningVisible = false;
  state.deleteWarningItemId = undefined;
  state.deleteWarningUsage = null;
};

export const selectViewData = ({ props, state }) => {
  return {
    items: props.items || [],
    contextMenuItems: props.contextMenuItems,
    emptyContextMenuItems: props.emptyContextMenuItems,
    deleteWarningVisible: state.deleteWarningVisible,
    deleteWarningUsage: state.deleteWarningUsage,
  };
};
