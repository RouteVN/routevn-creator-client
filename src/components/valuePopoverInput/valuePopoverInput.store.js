export const createInitialState = () => ({
  isOpen: false,
  position: {
    x: 0,
    y: 0,
  },
  value: "",
  tempValue: "",
});

export const setTempValue = ({ state }, { value } = {}) => {
  state.tempValue = value;
};

export const selectTempValue = ({ state }) => {
  return state.tempValue;
};

export const openPopover = ({ state }, { position } = {}) => {
  state.position = position;
  state.isOpen = true;
};

export const closePopover = ({ state }, _payload = {}) => {
  state.isOpen = false;
  state.tempValue = "";
};

export const setValue = ({ state }, { value } = {}) => {
  state.value = value;
};

export const selectViewData = ({ i18n = {}, props, state }) => {
  const hasValue = state.value !== "";
  const disabled = props.disabled === true;

  return {
    disabled,
    isOpen: state.isOpen,
    label: props.label ?? "",
    placeholder: props.placeholder ?? "",
    position: state.position,
    submitLabel: i18n.animationEditorPage?.doneButton ?? "Done",
    tempValue: state.tempValue,
    triggerCursor: disabled ? "default" : "pointer",
    triggerTabIndex: disabled ? -1 : 0,
    value: hasValue ? state.value : "-",
    valueColor: hasValue ? "fg" : "mu-fg",
  };
};
