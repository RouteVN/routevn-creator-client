const toFiniteNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getAlignmentAnchor = (value) => {
  if (value === "c" || value === "center") {
    return 0.5;
  }

  if (value === "e" || value === "end") {
    return 1;
  }

  return 0;
};

export const createRouteGraphicsTextPreviewState = ({
  preview = {},
  width,
  height,
} = {}) => {
  const renderWidth = Math.max(1, Math.round(toFiniteNumber(width, 1)));
  const renderHeight = Math.max(1, Math.round(toFiniteNumber(height, 1)));
  const padding = Math.max(0, toFiniteNumber(preview.padding, 0));
  const innerWidth = Math.max(1, renderWidth - padding * 2);
  const horizontalAnchor = getAlignmentAnchor(preview.horizontalAlignment);
  const verticalAnchor = getAlignmentAnchor(preview.verticalAlignment);
  const textAlign = preview.textStyle?.align ?? "left";
  const usesLayoutWidth =
    horizontalAnchor === 0 && (textAlign === "center" || textAlign === "right");

  const textElement = {
    id: "font-preview-text",
    type: "text",
    content: preview.content ?? "",
    x:
      horizontalAnchor === 0.5
        ? renderWidth / 2
        : horizontalAnchor === 1
          ? renderWidth - padding
          : padding,
    y:
      verticalAnchor === 0.5
        ? renderHeight / 2
        : verticalAnchor === 1
          ? renderHeight - padding
          : padding,
    anchorX: horizontalAnchor,
    anchorY: verticalAnchor,
    textStyle: {
      ...preview.textStyle,
    },
  };

  if (usesLayoutWidth) {
    textElement.width = innerWidth;
  }

  return {
    id: preview.renderId ?? "font-preview",
    elements: [textElement],
    animations: [],
    audio: [],
    audioEffects: [],
  };
};

export const createRouteGraphicsTextPreviewCacheKey = ({
  preview,
  width,
  height,
  backgroundColor,
} = {}) =>
  JSON.stringify({
    preview,
    width: Math.max(1, Math.round(toFiniteNumber(width, 1))),
    height: Math.max(1, Math.round(toFiniteNumber(height, 1))),
    backgroundColor,
  });
