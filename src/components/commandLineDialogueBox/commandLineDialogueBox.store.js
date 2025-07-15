export const INITIAL_STATE = Object.freeze({
  layouts: [],
  selectedLayoutId: '',
});

export const setLayouts = (state, layouts) => {
  state.layouts = layouts;
};

export const setSelectedLayoutId = (state, { layoutId }) => {
  state.selectedLayoutId = layoutId;
};

export const toViewData = ({ state, props }, payload) => {
  const layouts = props.layouts || [];
  
  const selectOptions = layouts.map((layout) => ({
    value: layout.id,
    label: layout.name,
  }));

  return {
    layouts: selectOptions,
    selectedLayoutId: state.selectedLayoutId,
    submitDisabled: !state.selectedLayoutId || state.selectedLayoutId === '',
  };
};
