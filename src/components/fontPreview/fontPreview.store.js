export const createInitialState = () => ({
  status: "idle",
});

export const setStatus = ({ state }, { status } = {}) => {
  state.status = status ?? "idle";
};

const getContrastBackground = (color) => {
  if (
    !color ||
    color === "currentColor" ||
    color === "inherit" ||
    color === "transparent"
  ) {
    return "transparent";
  }

  // Parse hex color to determine brightness
  const hex = color.replace("#", "");
  if (hex.length === 3 || hex.length === 6) {
    const rgb =
      hex.length === 3
        ? [
            parseInt(hex[0] + hex[0], 16),
            parseInt(hex[1] + hex[1], 16),
            parseInt(hex[2] + hex[2], 16),
          ]
        : [
            parseInt(hex.substr(0, 2), 16),
            parseInt(hex.substr(2, 2), 16),
            parseInt(hex.substr(4, 2), 16),
          ];

    // Calculate brightness using relative luminance formula
    const brightness = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;

    // Use stronger contrast for better visibility
    if (brightness < 0.5) {
      return "#a0a0a0";
    } else {
      return "#606060";
    }
  }

  return "transparent";
};

export const selectViewData = ({ props: attrs, state }) => {
  const height = attrs.height ? parseInt(attrs.height) : null;
  const padding = Number.parseFloat(attrs.padding);
  const textColor = attrs.color || "currentColor";
  const providedBackground = attrs.backgroundColor;
  const strokeColor =
    attrs.strokeColor === "undefined"
      ? "transparent"
      : attrs.strokeColor || "transparent";
  const strokeWidth = Number.parseFloat(attrs.strokeWidth);
  const resolvedStrokeWidth = Number.isFinite(strokeWidth) ? strokeWidth : 0;

  // Only use dynamic background if no background is explicitly provided
  const backgroundColor =
    providedBackground && providedBackground !== "transparent"
      ? providedBackground
      : getContrastBackground(textColor);

  return {
    status: state.status ?? "idle",
    previewText:
      attrs.previewText === "undefined" ? "" : attrs.previewText || "",
    fontFamily: attrs.fontFamily || "sans-serif",
    fontSize: parseInt(attrs.fontSize) || 100,
    lineHeight: attrs.lineHeight || "1.5",
    fontWeight: attrs.fontWeight || "normal",
    color: textColor,
    strokeColor,
    strokeWidth: resolvedStrokeWidth,
    width: parseInt(attrs.width) || 200,
    height: height || 150,
    heightStyle: height ? `height: ${height}px;` : "height: 100%;",
    padding: Number.isFinite(padding) ? Math.max(0, padding) : 0,
    backgroundColor: backgroundColor,
    textAlign: attrs.textAlign || "left",
    av: attrs.av || "",
    ah: attrs.ah || "",
  };
};

// Removed deprecated exports
