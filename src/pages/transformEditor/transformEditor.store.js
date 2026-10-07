import {
  areEditHistoryValuesEqual,
  createEditHistory,
  getEditHistoryChangeKey,
  getEditHistoryStep,
  moveEditHistoryStep,
  recordEditHistoryStep,
} from "../../internal/editHistory.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import { toFlatItems } from "../../internal/project/tree.js";
import { selectEditHistoryCopy } from "../../internal/ui/editHistory.js";
import {
  buildEditorCanvasLayout,
  buildEditorCanvasZoomViewData,
  resetEditorCanvasZoomState,
  selectShowEditorRightPanelState,
  setEditorCanvasZoomState,
  zoomEditorCanvasInState,
  zoomEditorCanvasOutState,
} from "../../internal/ui/editorCanvasWorkspace.js";
import {
  isTouchUiConfig,
  setMobileResourcePageWindowMetricsState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  normalizeTransformValues,
  toTransformInspectorValues,
} from "./support/transformEditorCanvas.js";
import { selectTransformEditorPageCopy } from "./support/transformEditorPageCopy.js";

// As in the layout editor, the right panel shows the transform's values
// (Edit) or the preview settings and Save Preview (Preview).
const RIGHT_PANEL_MODES = new Set(["edit", "preview"]);

const PREVIEW_IMAGE_SLOTS = Object.freeze([
  { key: "background", labelKey: "backgroundImageLabel" },
  { key: "target", labelKey: "targetImageLabel" },
]);

const createEmptyImageCollection = () => ({
  items: {},
  tree: [],
});

const createPreviewImageIds = (preview) => ({
  background: preview?.background?.imageId,
  target: preview?.target?.imageId,
});

const createImageSelectorDialog = () => ({
  open: false,
  slot: undefined,
  selectedImageId: undefined,
  originalImageId: undefined,
});

const createPreviewImageMenu = () => ({
  isOpen: false,
  x: 0,
  y: 0,
  slot: undefined,
  items: [],
});

const createFullImagePreview = () => ({
  visible: false,
  fileId: undefined,
});

const isPreviewImageSlot = (slot) =>
  PREVIEW_IMAGE_SLOTS.some((previewSlot) => previewSlot.key === slot);

const getImageItemById = (imagesData, imageId) => {
  if (!imageId) {
    return undefined;
  }

  const item = imagesData.items[imageId];
  return item?.type === "image" ? item : undefined;
};

export const createInitialState = () => ({
  isTouchMode: false,
  appWindowMetrics: { width: 0, height: 0 },
  transformId: undefined,
  transformName: "",
  transform: normalizeTransformValues(),
  // The values as last saved; edits save on their own, a moment after.
  savedTransform: undefined,
  // Preview settings save only with Save Preview.
  previewImageIds: createPreviewImageIds(),
  rightPanelMode: "edit",
  // Undo and redo for edits made since the page opened.
  editHistory: createEditHistory(),
  editHistoryBaseline: undefined,
  // The inspector previews number fields while a popover is open; the
  // canvas shows these values, which are not an edit until submitted.
  inspectorPreviewTransform: undefined,
  dragStartPosition: undefined,
  selectedElementMetrics: undefined,
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  imagesData: createEmptyImageCollection(),
  loadedAssetFileIds: [],
  // Preview image files that failed to load; the canvas leaves them out.
  failedAssetFileIds: [],
  warnedAssetFileIds: [],
  // Save Preview runs once at a time.
  isSavingPreview: false,
  canvasZoom: 1,
  imageSelectorDialog: createImageSelectorDialog(),
  previewImageMenu: createPreviewImageMenu(),
  fullImagePreview: createFullImagePreview(),
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

export const setAppWindowMetrics = ({ state }, { width, height } = {}) => {
  setMobileResourcePageWindowMetricsState(state, { width, height });
};

export const loadTransform = (
  { state },
  { item, projectResolution, imagesData } = {},
) => {
  state.transformId = item.id;
  state.transformName = item.name ?? "";
  state.transform = normalizeTransformValues(item);
  state.savedTransform = state.transform;
  state.previewImageIds = createPreviewImageIds(item.preview);
  state.editHistory = createEditHistory();
  state.editHistoryBaseline = state.transform;
  state.inspectorPreviewTransform = undefined;
  state.dragStartPosition = undefined;
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  state.imagesData = imagesData ?? createEmptyImageCollection();
  state.loadedAssetFileIds = [];
  state.failedAssetFileIds = [];
  state.warnedAssetFileIds = [];
};

export const selectTransformId = ({ state }) => state.transformId;

export const selectTransform = ({ state }) => state.transform;

// What the canvas shows: an inspector preview, or the transform.
export const selectCanvasTransform = ({ state }) =>
  state.inspectorPreviewTransform ?? state.transform;

export const selectRightPanelMode = ({ state }) => state.rightPanelMode;

export const setRightPanelMode = ({ state }, { mode } = {}) => {
  if (RIGHT_PANEL_MODES.has(mode)) {
    state.rightPanelMode = mode;
    state.inspectorPreviewTransform = undefined;
  }
};

export const selectProjectResolution = ({ state }) => state.projectResolution;

export const selectHasUnsavedValues = ({ state }) =>
  Boolean(state.transformId) &&
  !areEditHistoryValuesEqual(state.transform, state.savedTransform);

// Takes the values that were saved, since edits made while the save ran are
// still unsaved.
export const markValuesSaved = ({ state }, { transform } = {}) => {
  state.savedTransform = transform;
};

// The saved form of the preview images.
export const selectPreviewData = ({ state }) => {
  const preview = {};
  for (const { key } of PREVIEW_IMAGE_SLOTS) {
    const imageId = state.previewImageIds[key];
    if (imageId) {
      preview[key] = { imageId };
    }
  }
  return preview;
};

export const setTransform = ({ state }, { transform } = {}) => {
  state.transform = normalizeTransformValues(transform);
};

// Records the transform as it is now against the last recorded version.
// Repeated edits to the same values less than a second apart, such as
// nudging with the arrow keys, are one step, and an edit that changes
// nothing is not a step.
export const recordTransformEdit = ({ state }, { time } = {}) => {
  const before = state.editHistoryBaseline;
  // The baseline is set once the page has opened the transform.
  if (!before) {
    return;
  }
  const after = state.transform;
  if (areEditHistoryValuesEqual(before, after)) {
    return;
  }
  recordEditHistoryStep(state.editHistory, {
    before: { transform: before },
    after: { transform: after },
    mergeKey: getEditHistoryChangeKey(before, after),
    time,
  });
  state.editHistoryBaseline = after;
};

export const selectEditHistoryStep = ({ state }, { direction } = {}) =>
  getEditHistoryStep(state.editHistory, direction);

// Undoes or redoes the latest step: puts its version of the transform back.
export const applyEditHistoryStep = ({ state }, { direction } = {}) => {
  const step = getEditHistoryStep(state.editHistory, direction);
  if (!step) {
    return;
  }
  const { transform } = direction === "undo" ? step.before : step.after;
  moveEditHistoryStep(state.editHistory, direction);
  state.transform = transform;
  state.editHistoryBaseline = transform;
  state.inspectorPreviewTransform = undefined;
  state.dragStartPosition = undefined;
};

export const setInspectorPreviewTransform = ({ state }, { transform } = {}) => {
  state.inspectorPreviewTransform = normalizeTransformValues(transform);
};

export const clearInspectorPreviewTransform = ({ state }) => {
  state.inspectorPreviewTransform = undefined;
};

export const setDragStartPosition = ({ state }, { dragStartPosition } = {}) => {
  state.dragStartPosition = dragStartPosition;
};

export const clearDragStartPosition = ({ state }) => {
  state.dragStartPosition = undefined;
};

export const selectDragStartPosition = ({ state }) => state.dragStartPosition;

export const setSelectedElementMetrics = ({ state }, { metrics } = {}) => {
  state.selectedElementMetrics = metrics;
};

export const selectSelectedElementMetrics = ({ state }) =>
  state.selectedElementMetrics;

export const selectPreviewBackgroundImage = ({ state }) =>
  getImageItemById(state.imagesData, state.previewImageIds.background);

export const selectPreviewTargetImage = ({ state }) =>
  getImageItemById(state.imagesData, state.previewImageIds.target);

// The preview images the canvas draws. One whose file failed to load is left
// out, so the canvas shows the gray screen or the light gray square instead.
const selectAvailableImage = (state, imageId) => {
  const image = getImageItemById(state.imagesData, imageId);
  return image && !state.failedAssetFileIds.includes(image.fileId)
    ? image
    : undefined;
};

export const selectCanvasBackgroundImage = ({ state }) =>
  selectAvailableImage(state, state.previewImageIds.background);

export const selectCanvasTargetImage = ({ state }) =>
  selectAvailableImage(state, state.previewImageIds.target);

export const selectLoadedAssetFileIds = ({ state }) => state.loadedAssetFileIds;

export const selectFailedAssetFileIds = ({ state }) => state.failedAssetFileIds;

export const markAssetLoaded = ({ state }, { fileId } = {}) => {
  if (!state.loadedAssetFileIds.includes(fileId)) {
    state.loadedAssetFileIds.push(fileId);
  }
  state.failedAssetFileIds = state.failedAssetFileIds.filter(
    (failedFileId) => failedFileId !== fileId,
  );
};

export const markAssetFailed = ({ state }, { fileId } = {}) => {
  if (!state.failedAssetFileIds.includes(fileId)) {
    state.failedAssetFileIds.push(fileId);
  }
};

export const selectWarnedAssetFileIds = ({ state }) => state.warnedAssetFileIds;

export const markAssetWarningsShown = ({ state }, { fileIds } = {}) => {
  state.warnedAssetFileIds = [
    ...new Set([...state.warnedAssetFileIds, ...fileIds]),
  ];
};

export const selectIsSavingPreview = ({ state }) => state.isSavingPreview;

export const startSavingPreview = ({ state }) => {
  state.isSavingPreview = true;
};

export const finishSavingPreview = ({ state }) => {
  state.isSavingPreview = false;
};

export const zoomCanvasIn = ({ state }) => {
  zoomEditorCanvasInState(state);
};

export const zoomCanvasOut = ({ state }) => {
  zoomEditorCanvasOutState(state);
};

export const setCanvasZoom = ({ state }, { zoom } = {}) => {
  setEditorCanvasZoomState(state, { zoom });
};

export const resetCanvasZoom = ({ state }) => {
  resetEditorCanvasZoomState(state);
};

export const selectIsImageSelectorOpen = ({ state }) =>
  state.imageSelectorDialog.open;

export const openImageSelectorDialog = ({ state }, { slot } = {}) => {
  if (!isPreviewImageSlot(slot)) {
    return;
  }

  const imageId = state.previewImageIds[slot];
  state.imageSelectorDialog.open = true;
  state.imageSelectorDialog.slot = slot;
  state.imageSelectorDialog.selectedImageId = imageId;
  state.imageSelectorDialog.originalImageId = imageId;
};

// The canvas shows a picked image at once; cancel puts the original back.
export const applyImageSelectorSelection = ({ state }, { imageId } = {}) => {
  state.imageSelectorDialog.selectedImageId = imageId;
  state.previewImageIds[state.imageSelectorDialog.slot] = imageId;
};

export const commitImageSelectorSelection = ({ state }) => {
  const { slot, selectedImageId } = state.imageSelectorDialog;
  state.previewImageIds[slot] = selectedImageId;
  state.imageSelectorDialog = createImageSelectorDialog();
};

export const cancelImageSelectorDialog = ({ state }) => {
  const { slot, originalImageId } = state.imageSelectorDialog;
  if (slot) {
    state.previewImageIds[slot] = originalImageId;
  }
  state.imageSelectorDialog = createImageSelectorDialog();
  state.fullImagePreview = createFullImagePreview();
};

export const openPreviewImageMenu = ({ state }, { slot, x, y, items } = {}) => {
  state.previewImageMenu = createPreviewImageMenu();
  if (!isPreviewImageSlot(slot) || !state.previewImageIds[slot]) {
    return;
  }

  state.previewImageMenu.isOpen = true;
  state.previewImageMenu.x = x;
  state.previewImageMenu.y = y;
  state.previewImageMenu.slot = slot;
  state.previewImageMenu.items = items ?? [];
};

export const closePreviewImageMenu = ({ state }) => {
  state.previewImageMenu = createPreviewImageMenu();
};

export const selectPreviewImageMenuSlot = ({ state }) =>
  state.previewImageMenu.slot;

export const clearPreviewImage = ({ state }, { slot } = {}) => {
  if (isPreviewImageSlot(slot)) {
    state.previewImageIds[slot] = undefined;
  }
};

export const showFullImagePreview = ({ state }, { imageId } = {}) => {
  const imageItem = getImageItemById(state.imagesData, imageId);
  state.fullImagePreview.visible = true;
  state.fullImagePreview.fileId =
    imageItem?.thumbnailFileId ?? imageItem?.fileId;
};

export const hideFullImagePreview = ({ state }) => {
  state.fullImagePreview = createFullImagePreview();
};

const buildPreviewImageCard = (state, imageId) => {
  const item = getImageItemById(state.imagesData, imageId);
  if (!item) {
    return undefined;
  }

  return {
    name: item.name,
    previewFileId: item.thumbnailFileId ?? item.fileId,
  };
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectTransformEditorPageCopy(i18n);
  const editHistoryCopy = selectEditHistoryCopy(i18n);
  const { canvasBackgroundStyle, canvasWrapperStyle } = buildEditorCanvasLayout(
    { state, resolution: state.projectResolution },
  );
  const showRightPanel = selectShowEditorRightPanelState({ state });

  return {
    resourceCategory: "assets",
    selectedResourceId: "transform-editor",
    showExplorerPanel: !state.isTouchMode,
    showRightPanel,
    showMobilePanels: !showRightPanel,
    transformName: state.transformName,
    undoDisabled: state.editHistory.undo.length === 0,
    redoDisabled: state.editHistory.redo.length === 0,
    undoLabel: editHistoryCopy.undoLabel,
    redoLabel: editHistoryCopy.redoLabel,
    showCanvasZoomControls: showRightPanel,
    ...buildEditorCanvasZoomViewData(state.canvasZoom),
    canvasBackgroundStyle,
    canvasWrapperStyle,
    canvasZoomInLabel: copy.canvasZoomInLabel,
    canvasZoomOutLabel: copy.canvasZoomOutLabel,
    canvasZoomFitLabel: copy.canvasZoomFitLabel,
    canvasAspectRatio: formatProjectResolutionAspectRatio(
      state.projectResolution,
    ),
    rightPanelMode: state.rightPanelMode,
    rightPanelModeTabs: [
      { id: "edit", label: copy.editModeLabel },
      { id: "preview", label: copy.previewTitle },
    ],
    // Both bodies stay mounted, so scroll positions survive a switch.
    rightPanelEditStyle:
      state.rightPanelMode === "edit" ? "" : "display: none;",
    rightPanelPreviewStyle:
      state.rightPanelMode === "preview" ? "" : "display: none;",
    showSavePreviewButton: state.rightPanelMode === "preview",
    savePreviewDisabled: state.isSavingPreview,
    savePreviewButton: copy.savePreviewButton,
    previewImagesTitle: copy.previewImagesTitle,
    projectResolution: state.projectResolution,
    selectedElementMetrics: state.selectedElementMetrics,
    inspectorValues: toTransformInspectorValues(state.transform),
    previewImageSlots: PREVIEW_IMAGE_SLOTS.map(({ key, labelKey }) => ({
      slot: key,
      label: copy[labelKey],
      image: buildPreviewImageCard(state, state.previewImageIds[key]),
    })),
    selectImageLabel: copy.selectImageLabel,
    noPreviewLabel: copy.noPreviewLabel,
    confirmButton: copy.confirmButton,
    imageSelectorDialog: state.imageSelectorDialog,
    showImageSelectorFileExplorer: !state.isTouchMode,
    imageFolderItems: toFlatItems(state.imagesData).filter(
      (item) => item.type === "folder",
    ),
    previewImageMenu: state.previewImageMenu,
    fullImagePreviewVisible: state.fullImagePreview.visible,
    fullImagePreviewFileId: state.fullImagePreview.fileId,
  };
};
