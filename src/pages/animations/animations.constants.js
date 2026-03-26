import { requireProjectResolution } from "../../internal/projectResolution.js";

const BG_COLOR = "#4a4a4a";
const PREVIEW_RECT_WIDTH = 200;
const PREVIEW_RECT_HEIGHT = 200;

export const createAnimationResetState = (projectResolution) => {
  const { width, height } = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );

  return {
    elements: [
      {
        id: "bg",
        type: "rect",
        x: 0,
        y: 0,
        width,
        height,
        fill: BG_COLOR,
      },
      {
        id: "preview-element",
        type: "rect",
        x: width / 2,
        y: height / 2,
        width: PREVIEW_RECT_WIDTH,
        height: PREVIEW_RECT_HEIGHT,
        fill: "white",
        anchorX: 0.5,
        anchorY: 0.5,
      },
    ],
    animations: [],
  };
};
