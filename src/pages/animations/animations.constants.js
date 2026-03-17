const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const BG_COLOR = "#4a4a4a";
const PREVIEW_RECT_WIDTH = 200;
const PREVIEW_RECT_HEIGHT = 200;

const resetState = {
  elements: [
    {
      id: "bg",
      type: "rect",
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      fill: BG_COLOR,
    },
    {
      id: "preview-element",
      type: "rect",
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      width: PREVIEW_RECT_WIDTH,
      height: PREVIEW_RECT_HEIGHT,
      fill: "white",
      anchorX: 0.5,
      anchorY: 0.5,
    },
  ],
  animations: [],
};

export { resetState };
