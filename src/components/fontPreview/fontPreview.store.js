const INITIAL_STATE = Object.freeze({});

const toViewData = ({ state, attrs }) => {
  const showBorder = attrs.showBorder !== "false";
  const height = attrs.height ? parseInt(attrs.height) : null;

  return {
    previewText: attrs.previewText || "Aa",
    fontFamily: attrs.fontFamily || "sans-serif",
    fontSize: parseInt(attrs.fontSize) || 100,
    lineHeight: attrs.lineHeight || "1.5",
    fontWeight: attrs.fontWeight || "normal",
    color: attrs.color || "currentColor",
    width: parseInt(attrs.width) || 200,
    height: height || 150,
    heightStyle: height ? `height: ${height}px;` : "height: 100%;",
    backgroundColor: attrs.backgroundColor || "transparent",
    textAlign: attrs.textAlign || "left",
    av: attrs.av || "",
    ah: attrs.ah || "",
  };
};

export { INITIAL_STATE, toViewData };
