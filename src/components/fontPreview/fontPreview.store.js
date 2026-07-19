export const createInitialState = () => ({
  status: "idle",
  fontLoadKey: "",
});

export const startFontLoad = ({ state }, { key } = {}) => {
  state.fontLoadKey = key ?? "";
  state.status = "loading";
};

export const finishFontLoad = ({ state }, { key, status } = {}) => {
  if (state.fontLoadKey !== key) {
    return;
  }

  state.status = status ?? "ready";
};

export const selectFontLoadKey = ({ state }) => state.fontLoadKey;

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
  const height = attrs.height ? Number.parseInt(attrs.height, 10) : undefined;
  const width =
    attrs.width === "f" ? undefined : Number.parseInt(attrs.width, 10);
  const padding = Number.parseFloat(attrs.padding);
  const textColor = attrs.color || "currentColor";
  const providedBackground = attrs.backgroundColor;
  const strokeColor =
    attrs.strokeColor === "undefined"
      ? "transparent"
      : attrs.strokeColor || "transparent";
  const strokeWidth = Number.parseFloat(attrs.strokeWidth);
  const resolvedStrokeWidth = Number.isFinite(strokeWidth) ? strokeWidth : 0;
  const shadowColor =
    attrs.shadowColor === "undefined"
      ? "transparent"
      : attrs.shadowColor || "transparent";
  const shadowAlpha = Number.parseFloat(attrs.shadowAlpha);
  const resolvedShadowAlpha = Number.isFinite(shadowAlpha) ? shadowAlpha : 1;
  const shadowBlur = Number.parseFloat(attrs.shadowBlur);
  const shadowOffsetX = Number.parseFloat(attrs.shadowOffsetX);
  const shadowOffsetY = Number.parseFloat(attrs.shadowOffsetY);
  const fontSize = Number.parseInt(attrs.fontSize, 10) || 100;
  const lineHeight = Number.parseFloat(attrs.lineHeight);
  const resolvedPadding = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  const fileId =
    attrs.fileId && attrs.fileId !== "undefined" ? attrs.fileId : undefined;

  // Only use dynamic background if no background is explicitly provided
  const backgroundColor =
    providedBackground && providedBackground !== "transparent"
      ? providedBackground
      : getContrastBackground(textColor);
  const textStyle = {
    align: attrs.textAlign || "left",
    fill: textColor,
    fontFamily: fileId ?? attrs.fontFamily ?? "sans-serif",
    fontSize,
    fontWeight: attrs.fontWeight || "normal",
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : 1.5,
    strokeColor,
    strokeWidth: resolvedStrokeWidth,
  };

  if (shadowColor !== "transparent") {
    textStyle.shadow = {
      color: shadowColor,
      alpha: Math.min(1, Math.max(0, resolvedShadowAlpha)),
      blur: Number.isFinite(shadowBlur) ? Math.max(0, shadowBlur) : 0,
      offsetX: Number.isFinite(shadowOffsetX) ? shadowOffsetX : 2,
      offsetY: Number.isFinite(shadowOffsetY) ? shadowOffsetY : 2,
    };
  }

  return {
    status: state.status ?? "idle",
    isReady: state.status === "ready",
    widthStyle:
      attrs.width === "f" ? "width: 100%;" : `width: ${width || 200}px;`,
    heightStyle: height ? `height: ${height}px;` : "height: 100%;",
    routeGraphicsPreview: {
      mode: attrs.mode === "live" ? "live" : "thumbnail",
      content: attrs.previewText === "undefined" ? "" : attrs.previewText || "",
      padding: resolvedPadding,
      backgroundColor,
      horizontalAlignment: attrs.ah || "",
      verticalAlignment: attrs.av || "",
      textStyle,
    },
  };
};
