import { createRenderableParticleData } from "../../../internal/particles.js";
import { createParticlePreviewState } from "../../../internal/particlePreview.js";
import { createTransformSelectionHitArea } from "../../../internal/transformSelectionChrome.js";

// The emitter source outline uses the canvas drag events of the layout and
// transform editors' selection outline, which come for this id.
export const PARTICLE_SOURCE_OUTLINE_ID = "selected-border";

// Sizes on screen, in CSS pixels, so the outline looks the same at any zoom.
const OUTLINE_BORDER_WIDTH = 2;
const OUTLINE_MIN_SIZE = 16;
const OUTLINE_BORDER_COLOR = "#ffffff";

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

// The particle on its canvas: the background image, or black, and the
// particles, drawn only once the particle has a texture. Preview and Save
// Preview draw this; Edit adds the source outline on top.
export const createParticlePreviewRenderState = ({
  effect,
  imageItems,
  backgroundImage,
}) =>
  createParticlePreviewState(createRenderableParticleData(effect, imageItems), {
    backgroundImage,
  });

// The box around the emitter source, in canvas units: a rectangle as it is,
// a circle's or a line's bounding box, and a point. A box thinner than
// `minSize`, such as a point or a straight line, grows to it around its
// center.
export const getParticleSourceBounds = (source, { minSize = 0 } = {}) => {
  const data = source?.data ?? {};
  let bounds;
  if (source?.kind === "circle") {
    const radius = Math.max(0, toFiniteNumber(data.radius));
    bounds = {
      x: toFiniteNumber(data.x) - radius,
      y: toFiniteNumber(data.y) - radius,
      width: radius * 2,
      height: radius * 2,
    };
  } else if (source?.kind === "line") {
    const x1 = toFiniteNumber(data.x1);
    const y1 = toFiniteNumber(data.y1);
    const x2 = toFiniteNumber(data.x2);
    const y2 = toFiniteNumber(data.y2);
    bounds = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  } else if (source?.kind === "point") {
    bounds = {
      x: toFiniteNumber(data.x),
      y: toFiniteNumber(data.y),
      width: 0,
      height: 0,
    };
  } else {
    bounds = {
      x: toFiniteNumber(data.x),
      y: toFiniteNumber(data.y),
      width: Math.max(0, toFiniteNumber(data.width)),
      height: Math.max(0, toFiniteNumber(data.height)),
    };
  }

  if (bounds.width < minSize) {
    bounds.x -= (minSize - bounds.width) / 2;
    bounds.width = minSize;
  }
  if (bounds.height < minSize) {
    bounds.y -= (minSize - bounds.height) / 2;
    bounds.height = minSize;
  }
  return bounds;
};

// The part of the box on the canvas along one axis. A source mostly off the
// canvas, such as the Snow preset's strip above the top edge, is drawn
// `minSize` thick along the nearest edge, so it can still be dragged.
const fitAxisToCanvas = (start, size, canvasSize, minSize) => {
  const visibleStart = Math.max(0, start);
  const visibleEnd = Math.min(canvasSize, start + size);
  if (visibleEnd - visibleStart >= minSize) {
    return [visibleStart, visibleEnd - visibleStart];
  }

  const fittedSize = Math.min(minSize, canvasSize);
  const fittedStart = Math.min(
    Math.max(start + (size - fittedSize) / 2, 0),
    canvasSize - fittedSize,
  );
  return [fittedStart, fittedSize];
};

// The outline Edit draws around the emitter source; dragging it moves the
// source.
export const createParticleSourceOutline = ({
  effect,
  canvasUnitsPerCssPixel,
}) => {
  const source = effect.modules?.emission?.source;
  if (!source) {
    return undefined;
  }

  const minSize = OUTLINE_MIN_SIZE * canvasUnitsPerCssPixel;
  const borderWidth = OUTLINE_BORDER_WIDTH * canvasUnitsPerCssPixel;
  const bounds = getParticleSourceBounds(source, { minSize });
  const [x, width] = fitAxisToCanvas(
    bounds.x,
    bounds.width,
    effect.width,
    minSize,
  );
  const [y, height] = fitAxisToCanvas(
    bounds.y,
    bounds.height,
    effect.height,
    minSize,
  );
  // Inset by the border, as the scene editor's selection outline is, so the
  // border shows at the canvas edges too.
  const inset = Math.min(borderWidth, width / 4, height / 4);
  const outline = createTransformSelectionHitArea({
    id: PARTICLE_SOURCE_OUTLINE_ID,
    width: width - inset * 2,
    height: height - inset * 2,
    fill: "transparent",
    border: {
      color: OUTLINE_BORDER_COLOR,
      width: borderWidth,
      alpha: 1,
    },
  });
  outline.x = x + inset;
  outline.y = y + inset;
  return outline;
};

// The Edit tab's canvas: the preview with the source outline on top.
export const createParticleEditorRenderState = ({
  effect,
  imageItems,
  backgroundImage,
  canvasUnitsPerCssPixel,
}) => {
  const renderState = createParticlePreviewRenderState({
    effect,
    imageItems,
    backgroundImage,
  });
  const outline = createParticleSourceOutline({
    effect,
    canvasUnitsPerCssPixel,
  });
  if (outline) {
    renderState.elements.push(outline);
  }
  return renderState;
};

// The source moved by (dx, dy) from `source`, where a drag started. Both
// ends of a line move together.
export const moveParticleSource = (source, { dx, dy }) => {
  const data = { ...source.data };
  if (source.kind === "line") {
    data.x1 = Math.round(toFiniteNumber(data.x1) + dx);
    data.y1 = Math.round(toFiniteNumber(data.y1) + dy);
    data.x2 = Math.round(toFiniteNumber(data.x2) + dx);
    data.y2 = Math.round(toFiniteNumber(data.y2) + dy);
  } else {
    data.x = Math.round(toFiniteNumber(data.x) + dx);
    data.y = Math.round(toFiniteNumber(data.y) + dy);
  }
  return { ...source, data };
};
