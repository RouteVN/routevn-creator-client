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
  const deleteIncludeProps = state.deleteWarningUsage
    ? Object.entries(state.deleteWarningUsage.inProps || {}).map(
        ([name, usages]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          count: Array.isArray(usages) ? usages.length : 0,
        }),
      )
    : [];

  return {
    items: props.items || [],
    contextMenuItems: props.contextMenuItems,
    emptyContextMenuItems: props.emptyContextMenuItems,
    deleteWarningVisible: state.deleteWarningVisible,
    deleteWarningUsage: state.deleteWarningUsage,
    deleteIncludeProps,
  };
};
