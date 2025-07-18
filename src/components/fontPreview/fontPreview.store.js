const INITIAL_STATE = Object.freeze({});

const toViewData = ({ state, attrs }) => {
  const showBorder = attrs.showBorder !== "false";
  return {
    previewText: attrs.previewText || "Aa",
    fontFamily: attrs.fontFamily || "sans-serif",
    fontSize: parseInt(attrs.fontSize) || 100,
    fontWeight: attrs.fontWeight || "normal",
    color: attrs.color || "currentColor",
    width: parseInt(attrs.width) || 200,
    height: parseInt(attrs.height) || 150,
    backgroundColor: attrs.backgroundColor || "transparent",
    textAlign: attrs.textAlign || "center",
    borderClass: showBorder ? "bgc=bg bc=bo bw=xs br=md p=xs" : "",
  };
};

export { INITIAL_STATE, toViewData };
