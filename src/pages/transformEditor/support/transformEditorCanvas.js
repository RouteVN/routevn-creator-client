import {
  createTransformPreviewRenderState,
  TRANSFORM_PREVIEW_TARGET_ID,
} from "../../../internal/transformPreview.js";
import {
  normalizeTransformValues,
  roundTransformValue,
} from "../../../internal/transformValues.js";
import { createBackgroundTransformEditorCanvasState } from "../../../internal/ui/sceneEditor/backgroundTransformEditor.js";

// Scaling from an edge handle moves in the inspector's 0.01 steps.
export const roundTransformScale = (transform) => ({
  ...transform,
  scaleX: roundTransformValue(transform.scaleX, 2),
  scaleY: roundTransformValue(transform.scaleY, 2),
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
      targetId: TRANSFORM_PREVIEW_TARGET_ID,
      transform,
    },
    canvasUnitsPerCssPixel,
  });
