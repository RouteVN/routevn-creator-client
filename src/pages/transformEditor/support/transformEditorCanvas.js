import {
  DEFAULT_TRANSFORM_VALUES,
  TRANSFORM_VALUE_FIELDS,
} from "../../../internal/transformValues.js";
import { createBackgroundTransformEditorCanvasState } from "../../../internal/ui/sceneEditor/backgroundTransformEditor.js";

// The canvas element the transform applies to, which the selection outline
// follows.
export const TRANSFORM_EDITOR_TARGET_ID = "transform-target";

const BACKGROUND_COLOR = "#4a4a4a";
// Lighter than the background and darker than the white selection outline,
// so the outline stays visible on the default target.
const TARGET_COLOR = "#a0a0a0";
const FALLBACK_TARGET_SIZE = 200;

const toFiniteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

// Rounds away floating-point noise, such as 1.9100000000000001.
const roundValue = (value, decimals = 4) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const toPositiveNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

// The values a transform saves, from a saved transform or the inspector.
export const normalizeTransformValues = (values = {}) => {
  const transform = {};
  for (const field of TRANSFORM_VALUE_FIELDS) {
    transform[field] = roundValue(
      toFiniteNumber(values[field], DEFAULT_TRANSFORM_VALUES[field]),
    );
  }
  return transform;
};

// Scaling from an edge handle moves in the inspector's 0.01 steps.
export const roundTransformScale = (transform) => ({
  ...transform,
  scaleX: roundValue(transform.scaleX, 2),
  scaleY: roundValue(transform.scaleY, 2),
});

// The inspector shows the anchor as one { x, y } value.
export const toTransformInspectorValues = (transform) => ({
  ...transform,
  anchor: {
    x: transform.anchorX,
    y: transform.anchorY,
  },
});

export const createTransformFromInspectorValues = (
  transform,
  formValues = {},
) => {
  const values = { ...transform, ...formValues };
  if (formValues.anchor) {
    values.anchorX = formValues.anchor.x;
    values.anchorY = formValues.anchor.y;
  }
  return normalizeTransformValues(values);
};

const createSpriteSize = (image) => ({
  width: toPositiveNumber(image.width, FALLBACK_TARGET_SIZE),
  height: toPositiveNumber(image.height, FALLBACK_TARGET_SIZE),
});

// What the transform places: a character's sprites, an image, or a light
// gray square. A character draws as scenes draw it, a container placed by
// the transform with its sprites stacked from its top-left corner, the first
// at the bottom.
const createTargetElement = ({
  targetPlacement,
  targetImage,
  targetCharacterSprites,
}) => {
  if (targetCharacterSprites?.length > 0) {
    return {
      ...targetPlacement,
      type: "container",
      children: targetCharacterSprites.map((sprite, index) => ({
        id: `${TRANSFORM_EDITOR_TARGET_ID}-sprite-${index}`,
        type: "sprite",
        src: sprite.fileId,
        fileType: sprite.fileType ?? "image/png",
        x: 0,
        y: 0,
        ...createSpriteSize(sprite),
      })),
    };
  }

  if (targetImage?.fileId) {
    return {
      ...targetPlacement,
      type: "sprite",
      src: targetImage.fileId,
      fileType: targetImage.fileType ?? "image/png",
      ...createSpriteSize(targetImage),
    };
  }

  return {
    ...targetPlacement,
    type: "rect",
    width: FALLBACK_TARGET_SIZE,
    height: FALLBACK_TARGET_SIZE,
    fill: TARGET_COLOR,
  };
};

// The transform's preview: the background image, or a gray screen, and the
// target placed by the transform. Edit adds the selection outline on top, and
// Preview and Save Preview show it as it is, so the canvas looks the same on
// both tabs.
export const createTransformPreviewRenderState = ({
  projectResolution,
  transform,
  backgroundImage,
  targetImage,
  targetCharacterSprites,
}) => {
  const { width, height } = projectResolution;
  const backgroundElement = backgroundImage?.fileId
    ? {
        id: "transform-background",
        type: "sprite",
        src: backgroundImage.fileId,
        fileType: backgroundImage.fileType ?? "image/png",
        x: Math.round(width / 2),
        y: Math.round(height / 2),
        width,
        height,
        anchorX: 0.5,
        anchorY: 0.5,
      }
    : {
        id: "transform-background",
        type: "rect",
        x: 0,
        y: 0,
        width,
        height,
        fill: BACKGROUND_COLOR,
      };
  const targetPlacement = {
    id: TRANSFORM_EDITOR_TARGET_ID,
    x: transform.x,
    y: transform.y,
    rotation: transform.rotation,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    anchorX: transform.anchorX,
    anchorY: transform.anchorY,
  };
  return {
    id: "transform-editor",
    elements: [
      backgroundElement,
      createTargetElement({
        targetPlacement,
        targetImage,
        targetCharacterSprites,
      }),
    ],
    animations: [],
  };
};

// The editor canvas adds the scene editor's selection outline to the
// preview: drag the border to move the target, or an edge to scale it.
export const createTransformEditorCanvasState = ({
  graphicsService,
  projectResolution,
  transform,
  backgroundImage,
  targetImage,
  targetCharacterSprites,
  canvasUnitsPerCssPixel,
}) =>
  createBackgroundTransformEditorCanvasState({
    renderState: createTransformPreviewRenderState({
      projectResolution,
      transform,
      backgroundImage,
      targetImage,
      targetCharacterSprites,
    }),
    graphicsService,
    editorState: {
      targetType: "visual",
      targetId: TRANSFORM_EDITOR_TARGET_ID,
      transform,
    },
    canvasUnitsPerCssPixel,
  });
