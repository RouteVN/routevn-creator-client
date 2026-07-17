import { formatProjectResolutionAspectRatio } from "../../projectResolution.js";

export const IMAGE_PREVIEW_DISPLAY_MODE_FIT = "fit";
export const IMAGE_PREVIEW_DISPLAY_MODE_CANVAS = "canvas";

const APP_VIEWPORT_HEIGHT = "var(--rvn-app-viewport-height, 100vh)";
const APP_VIEWPORT_TOP = "var(--rvn-window-content-offset, 0px)";

export const isImagePreviewDisplayMode = (displayMode) =>
  displayMode === IMAGE_PREVIEW_DISPLAY_MODE_FIT ||
  displayMode === IMAGE_PREVIEW_DISPLAY_MODE_CANVAS;

export const createImagePreviewFrameStyle = (projectResolution) => {
  const aspectRatio = formatProjectResolutionAspectRatio(projectResolution);

  return [
    `width: min(88vw, calc((${APP_VIEWPORT_HEIGHT} - 120px) * (${aspectRatio})))`,
    `aspect-ratio: ${aspectRatio}`,
    "max-width: 88vw",
    `max-height: calc(${APP_VIEWPORT_HEIGHT} - 120px)`,
  ].join("; ");
};

export const createImagePreviewLayoutStyle = (projectResolution) => {
  const aspectRatio = formatProjectResolutionAspectRatio(projectResolution);

  return [
    `width: min(88vw, calc((${APP_VIEWPORT_HEIGHT} - 120px) * (${aspectRatio})))`,
    "max-width: 88vw",
    "position: fixed",
    `top: calc(${APP_VIEWPORT_TOP} + (${APP_VIEWPORT_HEIGHT} / 2))`,
    "left: 50%",
    "transform: translate(-50%, -50%)",
    "z-index: 3001",
  ].join("; ");
};

export const createImagePreviewTopBarStyle = () => {
  return [
    "position: absolute",
    "left: 0",
    "right: 0",
    "bottom: calc(100% + 8px)",
    "display: grid",
    "grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)",
    "align-items: center",
  ].join("; ");
};

const resolvePositiveNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : undefined;
};

export const createImagePreviewImageWrapperStyle = ({
  image,
  displayMode,
  projectResolution,
} = {}) => {
  if (displayMode !== IMAGE_PREVIEW_DISPLAY_MODE_CANVAS) {
    return "position: absolute; inset: 0;";
  }

  const imageWidth = resolvePositiveNumber(image?.width);
  const imageHeight = resolvePositiveNumber(image?.height);
  if (!imageWidth || !imageHeight) {
    return "position: absolute; inset: 0;";
  }

  const widthPercent = (imageWidth / projectResolution.width) * 100;
  const heightPercent = (imageHeight / projectResolution.height) * 100;

  return [
    "position: absolute",
    "left: 50%",
    "top: 50%",
    `width: ${widthPercent}%`,
    `height: ${heightPercent}%`,
    "transform: translate(-50%, -50%)",
  ].join("; ");
};

export const createImagePreviewModeButtonViewData = ({
  displayMode,
  mode,
} = {}) => {
  const selected = displayMode === mode;

  return {
    backgroundColor: selected ? "ac" : "bg",
    borderColor: selected ? "ac" : "bo",
    iconColor: selected ? "white" : "mu-fg",
    selected,
    variant: selected ? "pr" : "ol",
  };
};

export const createImagePreviewOverlayViewData = ({
  state,
  image,
  projectResolution,
  previousItemId,
  nextItemId,
  breadcrumb,
  copy,
} = {}) => ({
  fullImagePreviewVisible: state.fullImagePreviewVisible,
  fullImagePreviewFileId: state.fullImagePreviewFileId,
  fullImagePreviewBreadcrumb: breadcrumb ?? "",
  fullImagePreviewLayoutStyle: createImagePreviewLayoutStyle(projectResolution),
  fullImagePreviewTopBarStyle: createImagePreviewTopBarStyle(),
  fullImagePreviewFrameStyle: createImagePreviewFrameStyle(projectResolution),
  fullImagePreviewImageWrapperStyle: createImagePreviewImageWrapperStyle({
    image,
    displayMode: state.fullImagePreviewDisplayMode,
    projectResolution,
  }),
  fullImagePreviewDisplayMode: state.fullImagePreviewDisplayMode,
  fullImagePreviewFitModeButton: createImagePreviewModeButtonViewData({
    displayMode: state.fullImagePreviewDisplayMode,
    mode: IMAGE_PREVIEW_DISPLAY_MODE_FIT,
  }),
  fullImagePreviewCanvasModeButton: createImagePreviewModeButtonViewData({
    displayMode: state.fullImagePreviewDisplayMode,
    mode: IMAGE_PREVIEW_DISPLAY_MODE_CANVAS,
  }),
  fullImagePreviewPreviousVisible: Boolean(previousItemId),
  fullImagePreviewNextVisible: Boolean(nextItemId),
  fullImagePreviewCanvasModeLabel: copy.previewCanvasModeLabel,
  fullImagePreviewFitModeLabel: copy.previewFitModeLabel,
  fullImagePreviewPreviousLabel: copy.previewPreviousLabel,
  fullImagePreviewNextLabel: copy.previewNextLabel,
});

export const resolveImagePreviewNavigationDirection = (event) => {
  if (event.key === "ArrowDown") {
    return { direction: "next" };
  }

  if (event.key === "ArrowUp") {
    return { direction: "previous" };
  }

  if (event.altKey || event.metaKey) {
    return undefined;
  }

  if (event.ctrlKey) {
    const key = String(event.key ?? "").toLowerCase();
    if (key === "d") {
      return { direction: "next", distance: 10, clamp: true };
    }

    if (key === "u") {
      return { direction: "previous", distance: 10, clamp: true };
    }

    return undefined;
  }

  const key = String(event.key ?? "").toLowerCase();
  if (key === "j") {
    return { direction: "next" };
  }

  if (key === "k") {
    return { direction: "previous" };
  }

  return undefined;
};

export const resolveImagePreviewDisplayMode = (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return undefined;
  }

  if (event.key === "ArrowLeft") {
    return IMAGE_PREVIEW_DISPLAY_MODE_CANVAS;
  }

  if (event.key === "ArrowRight") {
    return IMAGE_PREVIEW_DISPLAY_MODE_FIT;
  }

  const key = String(event.key ?? "").toLowerCase();
  if (key === "h") {
    return IMAGE_PREVIEW_DISPLAY_MODE_CANVAS;
  }

  if (key === "l") {
    return IMAGE_PREVIEW_DISPLAY_MODE_FIT;
  }

  return undefined;
};
