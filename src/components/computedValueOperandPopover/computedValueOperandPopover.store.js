export const createInitialState = () => ({
  value: 0,
});

export const resetValue = ({ state }) => {
  state.value = 0;
};

export const setValue = ({ state }, { value } = {}) => {
  state.value = Number.isFinite(value) ? value : undefined;
};

export const selectValue = ({ state }) => state.value;

export const selectViewData = ({ i18n, props, state }) => {
  const copy = i18n?.variablesPage ?? {};

  return {
    open: props.open === true,
    x: props.x ?? 0,
    y: props.y ?? 0,
    value: state.value,
    valueLabel: copy.computedNodeValueSource ?? "Value",
    addValueLabel: copy.addValueButton ?? "Add Value",
  };
};
