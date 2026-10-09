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
import { buildCharacterSpritePreviewLayers } from "../../internal/characterSpritePreview.js";
import { toFlatItems } from "../../internal/project/tree.js";
import {
  getTransformPreviewImage,
  getTransformTargetCharacterSprites,
} from "../../internal/transformPreview.js";
import { normalizeTransformValues } from "../../internal/transformValues.js";
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
import { toTransformInspectorValues } from "./support/transformEditorCanvas.js";
import { selectTransformEditorPageCopy } from "./support/transformEditorPageCopy.js";

// As in the layout editor, the right panel shows the transform's values
// (Edit) or the preview settings (Preview).
const RIGHT_PANEL_MODES = new Set(["edit", "preview"]);

const PREVIEW_IMAGE_SLOTS = Object.freeze([
  { key: "background", labelKey: "backgroundImageLabel" },
  { key: "target", labelKey: "targetImageLabel" },
]);

const createEmptyImageCollection = () => ({
  items: {},
  tree: [],
});

// What a preview slot shows, as saved: an image, or a character with one
// sprite per sprite group. The background is always an image.
const createPreviewVisual = (slot) => {
  if (slot?.characterId) {
    return {
      characterId: slot.characterId,
      sprites: structuredClone(slot.sprites),
    };
  }
  if (slot?.imageId) {
    return { imageId: slot.imageId };
  }
  return undefined;
};

const createPreviewSlots = (preview) => ({
  background: createPreviewVisual(preview?.background),
  target: createPreviewVisual(preview?.target),
});

// The saved form of the preview settings.
const createPreviewData = (previewSlots) => {
  const preview = {};
  for (const { key } of PREVIEW_IMAGE_SLOTS) {
    const visual = createPreviewVisual(previewSlots[key]);
    if (visual) {
      preview[key] = visual;
    }
  }
  return preview;
};

// The preview slots as picked. A picker shows its pick on the canvas at
// once, but its slot keeps what it showed before until OK.
const getCommittedPreviewSlots = (state) => {
  const slots = { ...state.previewSlots };
  if (state.imageSelectorDialog.open) {
    slots[state.imageSelectorDialog.slot] =
      state.imageSelectorDialog.originalVisual;
  }
  if (state.characterSpriteDialog.open) {
    slots.target = state.characterSpriteDialog.originalTarget;
  }
  return slots;
};

const createImageSelectorDialog = () => ({
  open: false,
  slot: undefined,
  selectedImageId: undefined,
  originalVisual: undefined,
});

const createCharacterSpriteDialog = () => ({
  open: false,
  // The target when the dialog opened, which cancel puts back.
  originalTarget: undefined,
  selection: undefined,
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

export const createInitialState = () => ({
  isTouchMode: false,
  appWindowMetrics: { width: 0, height: 0 },
  transformId: undefined,
  transformName: "",
  transform: normalizeTransformValues(),
  // The values and preview settings as last saved; edits to either save on
  // their own, a moment after.
  savedTransform: undefined,
  previewSlots: createPreviewSlots(),
  savedPreview: undefined,
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
  charactersData: createEmptyImageCollection(),
  loadedAssetFileIds: [],
  // Preview image files that failed to load; the canvas leaves them out.
  failedAssetFileIds: [],
  warnedAssetFileIds: [],
  canvasZoom: 1,
  imageSelectorDialog: createImageSelectorDialog(),
  characterSpriteDialog: createCharacterSpriteDialog(),
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
  { item, projectResolution, imagesData, charactersData } = {},
) => {
  state.transformId = item.id;
  state.transformName = item.name ?? "";
  state.transform = normalizeTransformValues(item);
  state.savedTransform = state.transform;
  state.previewSlots = createPreviewSlots(item.preview);
  state.savedPreview = createPreviewData(state.previewSlots);
  state.editHistory = createEditHistory();
  state.editHistoryBaseline = state.transform;
  state.inspectorPreviewTransform = undefined;
  state.dragStartPosition = undefined;
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
  state.imagesData = imagesData ?? createEmptyImageCollection();
  state.charactersData = charactersData ?? createEmptyImageCollection();
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

// The transform's values and its preview settings, each when it differs from
// what is saved.
export const selectUnsavedChanges = ({ state }) => {
  const changes = {};
  if (!state.transformId) {
    return changes;
  }

  if (!areEditHistoryValuesEqual(state.transform, state.savedTransform)) {
    changes.transform = state.transform;
  }
  const preview = createPreviewData(getCommittedPreviewSlots(state));
  if (!areEditHistoryValuesEqual(preview, state.savedPreview)) {
    changes.preview = preview;
  }
  return changes;
};

// Takes what was saved, since edits made while the save ran are still
// unsaved.
export const markChangesSaved = ({ state }, { transform, preview } = {}) => {
  if (transform) {
    state.savedTransform = transform;
  }
  if (preview) {
    state.savedPreview = preview;
  }
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
  getTransformPreviewImage(
    state.imagesData,
    state.previewSlots.background?.imageId,
  );

export const selectPreviewTargetImage = ({ state }) =>
  getTransformPreviewImage(
    state.imagesData,
    state.previewSlots.target?.imageId,
  );

const getCharacterItemById = (charactersData, characterId) => {
  const item = charactersData.items[characterId];
  return item?.type === "character" ? item : undefined;
};

export const selectPreviewTargetCharacterSprites = ({ state }) =>
  getTransformTargetCharacterSprites(
    state.charactersData,
    state.previewSlots.target,
  );

// The preview images the canvas draws. One whose file failed to load is left
// out, so the canvas shows the gray screen or the light gray square instead.
const selectAvailableImage = (state, imageId) => {
  const image = getTransformPreviewImage(state.imagesData, imageId);
  return image && !state.failedAssetFileIds.includes(image.fileId)
    ? image
    : undefined;
};

export const selectCanvasBackgroundImage = ({ state }) =>
  selectAvailableImage(state, state.previewSlots.background?.imageId);

export const selectCanvasTargetImage = ({ state }) =>
  selectAvailableImage(state, state.previewSlots.target?.imageId);

// A sprite that failed to load is left out, and the rest still draw.
export const selectCanvasTargetCharacterSprites = ({ state }) =>
  getTransformTargetCharacterSprites(
    state.charactersData,
    state.previewSlots.target,
  ).filter((sprite) => !state.failedAssetFileIds.includes(sprite.fileId));

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

// Picking a preview image or character sprite opens a dialog, which takes
// the keys.
export const selectIsPreviewPickerOpen = ({ state }) =>
  state.imageSelectorDialog.open || state.characterSpriteDialog.open;

export const openImageSelectorDialog = ({ state }, { slot } = {}) => {
  if (!isPreviewImageSlot(slot)) {
    return;
  }

  state.imageSelectorDialog.open = true;
  state.imageSelectorDialog.slot = slot;
  state.imageSelectorDialog.selectedImageId = state.previewSlots[slot]?.imageId;
  state.imageSelectorDialog.originalVisual = state.previewSlots[slot];
};

// The canvas shows a picked image at once; cancel puts the original back.
export const applyImageSelectorSelection = ({ state }, { imageId } = {}) => {
  state.imageSelectorDialog.selectedImageId = imageId;
  state.previewSlots[state.imageSelectorDialog.slot] = createPreviewVisual({
    imageId,
  });
};

// OK without a picked image keeps what the slot showed.
export const commitImageSelectorSelection = ({ state }) => {
  const { slot, selectedImageId, originalVisual } = state.imageSelectorDialog;
  state.previewSlots[slot] = selectedImageId
    ? createPreviewVisual({ imageId: selectedImageId })
    : originalVisual;
  state.imageSelectorDialog = createImageSelectorDialog();
};

export const cancelImageSelectorDialog = ({ state }) => {
  const { slot, originalVisual } = state.imageSelectorDialog;
  if (slot) {
    state.previewSlots[slot] = originalVisual;
  }
  state.imageSelectorDialog = createImageSelectorDialog();
  state.fullImagePreview = createFullImagePreview();
};

export const openCharacterSpriteDialog = ({ state }) => {
  const target = state.previewSlots.target;
  state.characterSpriteDialog.open = true;
  state.characterSpriteDialog.originalTarget = target;
  state.characterSpriteDialog.selection = target?.characterId
    ? target
    : undefined;
};

// The canvas shows the picked sprites at once; cancel puts the original
// target back.
export const applyCharacterSpriteSelection = (
  { state },
  { selection } = {},
) => {
  state.characterSpriteDialog.selection = selection;
  if (selection) {
    state.previewSlots.target = createPreviewVisual(selection);
  }
};

export const commitCharacterSpriteSelection = ({ state }) => {
  state.characterSpriteDialog = createCharacterSpriteDialog();
};

export const cancelCharacterSpriteDialog = ({ state }) => {
  state.previewSlots.target = state.characterSpriteDialog.originalTarget;
  state.characterSpriteDialog = createCharacterSpriteDialog();
};

export const selectHasPreviewVisual = ({ state }, { slot } = {}) =>
  isPreviewImageSlot(slot) && Boolean(state.previewSlots[slot]);

export const openPreviewImageMenu = ({ state }, { slot, x, y, items } = {}) => {
  state.previewImageMenu = createPreviewImageMenu();
  if (!isPreviewImageSlot(slot)) {
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
    state.previewSlots[slot] = undefined;
  }
};

export const showFullImagePreview = ({ state }, { imageId } = {}) => {
  const imageItem = getTransformPreviewImage(state.imagesData, imageId);
  state.fullImagePreview.visible = true;
  state.fullImagePreview.fileId =
    imageItem?.thumbnailFileId ?? imageItem?.fileId;
};

export const hideFullImagePreview = ({ state }) => {
  state.fullImagePreview = createFullImagePreview();
};

// A slot's card shows its image, or its character's sprites stacked.
const buildPreviewImageCard = (state, visual) => {
  const character = getCharacterItemById(
    state.charactersData,
    visual?.characterId,
  );
  if (character) {
    return {
      name: character.name,
      layers: buildCharacterSpritePreviewLayers({
        spritesCollection: character.sprites,
        spriteIds: visual.sprites.map((sprite) => sprite.resourceId),
      }),
    };
  }

  const item = getTransformPreviewImage(state.imagesData, visual?.imageId);
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
    previewImagesTitle: copy.previewImagesTitle,
    projectResolution: state.projectResolution,
    selectedElementMetrics: state.selectedElementMetrics,
    inspectorValues: toTransformInspectorValues(state.transform),
    previewImageSlots: PREVIEW_IMAGE_SLOTS.map(({ key, labelKey }) => ({
      slot: key,
      label: copy[labelKey],
      image: buildPreviewImageCard(state, state.previewSlots[key]),
    })),
    selectImageLabel: copy.selectImageLabel,
    noPreviewLabel: copy.noPreviewLabel,
    confirmButton: copy.confirmButton,
    imageSelectorDialog: state.imageSelectorDialog,
    characterSpriteDialog: {
      open: state.characterSpriteDialog.open,
      characterId: state.characterSpriteDialog.originalTarget?.characterId,
      sprites: state.characterSpriteDialog.originalTarget?.sprites ?? [],
    },
    characterSpriteConfirmDisabled: !state.characterSpriteDialog.selection,
    showImageSelectorFileExplorer: !state.isTouchMode,
    imageFolderItems: toFlatItems(state.imagesData).filter(
      (item) => item.type === "folder",
    ),
    previewImageMenu: state.previewImageMenu,
    fullImagePreviewVisible: state.fullImagePreview.visible,
    fullImagePreviewFileId: state.fullImagePreview.fileId,
  };
};
