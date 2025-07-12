const INITIAL_STATE = Object.freeze({});

const toViewData = ({ state, props }) => {
  return {
    previewText: props.previewText || 'Aa',
    fontFamily: props.fontFamily || 'sans-serif',
    fontSize: props.fontSize || 100,
    fontWeight: props.fontWeight || 'normal',
    color: props.color || 'currentColor',
    width: props.width || 200,
    height: props.height || 150,
    backgroundColor: props.backgroundColor || 'transparent',
    textAlign: props.textAlign || 'center',
    showLabel: props.showLabel !== false,
    labelText: props.labelText || props.fontFamily
  };
};

export { INITIAL_STATE, toViewData };