import {
  areEditHistoryValuesEqual,
  createEditHistory,
  getEditHistoryChangeKey,
  getEditHistoryStep,
  moveEditHistoryStep,
  recordEditHistoryStep,
} from "../../internal/editHistory.js";
import {
  collectParticleTextureImageIds,
  createRenderableParticleData,
  resolveParticleTextureImageItem,
} from "../../internal/particles.js";
import {
  formatParticleAspectRatio,
  hasRenderableParticleTexture,
} from "../../internal/particlePreview.js";
import { DEFAULT_PROJECT_RESOLUTION } from "../../internal/projectResolution.js";
import { toFlatItems } from "../../internal/project/tree.js";
import { selectEditHistoryCopy } from "../../internal/ui/editHistory.js";
import {
  buildEditorCanvasLayout,
  buildEditorCanvasZoomViewData,
  buildEditorPanelPlacementViewData,
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
  PARTICLE_FORM_CONDITION_FIELDS,
  applyParticleFormChange,
  buildParticleFormValues,
  buildParticleSliderValueFields,
  createParticleForm,
  replaceParticleTextureImage,
} from "./support/particleEditorForm.js";
import { selectParticleEditorPageCopy } from "./support/particleEditorPageCopy.js";

// As in the layout editor, the right panel shows the particle's values
// (Edit) or the preview settings (Preview).
const RIGHT_PANEL_MODES = new Set(["edit", "preview"]);

// The image picker sets the texture, or the preview background.
const IMAGE_SELECTOR_SLOTS = new Set(["texture", "background"]);

const createEmptyImageCollection = () => ({
  items: {},
  tree: [],
});

// What this page edits and saves: the particle's size, seed and modules. Its
// name, description and tags are edited on the particles page.
const toParticleEffect = (item) => ({
  width: item.width,
  height: item.height,
  // The form saves a blank seed as null.
  seed: item.seed ?? null,
  modules: item.modules,
});

const createEmptyEffect = () =>
  toParticleEffect({
    width: DEFAULT_PROJECT_RESOLUTION.width,
    height: DEFAULT_PROJECT_RESOLUTION.height,
    modules: { emission: {}, appearance: {} },
  });

const createImageSelectorDialog = () => ({
  open: false,
  slot: undefined,
  selectedImageId: undefined,
  originalImageId: undefined,
});

const createBackgroundImageMenu = () => ({
  isOpen: false,
  x: 0,
  y: 0,
  items: [],
});

const createFullImagePreview = () => ({
  visible: false,
  fileId: undefined,
});

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
  particleId: undefined,
  particleName: "",
  effect: createEmptyEffect(),
  // The effect as last saved; edits save on their own, a moment after.
  savedEffect: undefined,
  // The preview background, and as last saved. A picked one saves on its
  // own, as edits do, but is not part of the undo history; the thumbnail
  // draws it.
  previewBackgroundImageId: undefined,
  savedPreviewBackgroundImageId: undefined,
  rightPanelMode: "edit",
  // Remounts the form, for values that change outside it (undo, redo, a
  // drag on the canvas) or that it shows differently from how they were
  // typed.
  formRevision: 0,
  // Undo and redo for edits made since the page opened.
  editHistory: createEditHistory(),
  editHistoryBaseline: undefined,
  dragStartPosition: undefined,
  // The value a slider popover shows on the canvas before it is submitted.
  sliderPreview: undefined,
  // The canvas renderer's size, which is the particle's size.
  graphicsSize: undefined,
  imagesData: createEmptyImageCollection(),
  loadedAssetFileIds: [],
  // Image files that failed to load; the canvas leaves them out.
  failedAssetFileIds: [],
  warnedAssetFileIds: [],
  canvasZoom: 1,
  imageSelectorDialog: createImageSelectorDialog(),
  backgroundImageMenu: createBackgroundImageMenu(),
  fullImagePreview: createFullImagePreview(),
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

// Moving the panel between the right side and under the canvas rebuilds its
// slider fields, which closes an open popover without a cancel, so the value
// it showed goes too.
export const setAppWindowMetrics = ({ state }, { width, height } = {}) => {
  const showedRightPanel = selectShowEditorRightPanelState({ state });
  setMobileResourcePageWindowMetricsState(state, { width, height });
  if (selectShowEditorRightPanelState({ state }) !== showedRightPanel) {
    state.sliderPreview = undefined;
  }
};

export const loadParticle = ({ state }, { item, imagesData } = {}) => {
  state.particleId = item.id;
  state.particleName = item.name ?? "";
  state.effect = toParticleEffect(item);
  state.savedEffect = state.effect;
  state.previewBackgroundImageId = item.preview?.background?.imageId;
  state.savedPreviewBackgroundImageId = state.previewBackgroundImageId;
  state.editHistory = createEditHistory();
  state.editHistoryBaseline = state.effect;
  state.dragStartPosition = undefined;
  state.imagesData = imagesData ?? createEmptyImageCollection();
  state.loadedAssetFileIds = [];
  state.failedAssetFileIds = [];
  state.warnedAssetFileIds = [];
};

export const selectParticleId = ({ state }) => state.particleId;

export const selectEffect = ({ state }) => state.effect;

export const selectHasUnsavedValues = ({ state }) =>
  Boolean(state.particleId) &&
  !areEditHistoryValuesEqual(state.effect, state.savedEffect);

// Takes the effect that was saved, since edits made while the save ran are
// still unsaved.
export const markValuesSaved = ({ state }, { effect } = {}) => {
  state.savedEffect = effect;
};

export const setEffect = ({ state }, { effect } = {}) => {
  state.effect = effect;
};

// Remounts the form with the particle's values as they are now.
export const refreshForm = ({ state }) => {
  state.formRevision += 1;
};

// Records the effect as it is now against the last recorded version.
// Repeated edits to the same values less than a second apart, such as
// changing one number a few times, are one step; with `merge: false`, as for
// a drag, the edit is always its own step. An edit that changes nothing is
// not a step.
export const recordParticleEdit = ({ state }, { time, merge = true } = {}) => {
  const before = state.editHistoryBaseline;
  // The baseline is set once the page has opened the particle.
  if (!before) {
    return;
  }
  const after = state.effect;
  if (areEditHistoryValuesEqual(before, after)) {
    return;
  }
  recordEditHistoryStep(state.editHistory, {
    before: { effect: before },
    after: { effect: after },
    mergeKey: merge ? getEditHistoryChangeKey(before, after) : undefined,
    time,
  });
  state.editHistoryBaseline = after;
};

export const selectEditHistoryStep = ({ state }, { direction } = {}) =>
  getEditHistoryStep(state.editHistory, direction);

// Undoes or redoes the latest step: puts its version of the effect back, and
// the form shows it.
export const applyEditHistoryStep = ({ state }, { direction } = {}) => {
  const step = getEditHistoryStep(state.editHistory, direction);
  if (!step) {
    return;
  }
  const { effect } = direction === "undo" ? step.before : step.after;
  moveEditHistoryStep(state.editHistory, direction);
  state.effect = effect;
  state.editHistoryBaseline = effect;
  state.dragStartPosition = undefined;
  state.formRevision += 1;
};

export const selectRightPanelMode = ({ state }) => state.rightPanelMode;

export const setRightPanelMode = ({ state }, { mode } = {}) => {
  if (RIGHT_PANEL_MODES.has(mode)) {
    state.rightPanelMode = mode;
  }
};

// The emitter source's outline, which moves the source, shows while Edit is
// open, as the layout editor shows its selection's.
export const selectShowsSourceOutline = ({ state }) =>
  state.rightPanelMode === "edit";

export const setDragStartPosition = ({ state }, { dragStartPosition } = {}) => {
  state.dragStartPosition = dragStartPosition;
};

export const clearDragStartPosition = ({ state }) => {
  state.dragStartPosition = undefined;
};

export const selectDragStartPosition = ({ state }) => state.dragStartPosition;

export const selectGraphicsSize = ({ state }) => state.graphicsSize;

// The canvas renderer starts again at a new size, so it has no images
// loaded.
export const setGraphicsSize = ({ state }, { width, height } = {}) => {
  state.graphicsSize = { width, height };
  state.loadedAssetFileIds = [];
};

// The particle the canvas shows: the effect, with the texture being picked
// while the image picker is open, or the value a slider popover shows.
const selectCanvasEffectState = (state) => {
  const { open, slot, selectedImageId, originalImageId } =
    state.imageSelectorDialog;
  if (
    open &&
    slot === "texture" &&
    selectedImageId &&
    selectedImageId !== originalImageId
  ) {
    return replaceParticleTextureImage(state.effect, selectedImageId);
  }
  if (state.sliderPreview) {
    return applyParticleFormChange(state.effect, state.sliderPreview).effect;
  }
  return state.effect;
};

export const selectCanvasEffect = ({ state }) => selectCanvasEffectState(state);

export const setSliderPreview = ({ state }, { name, value } = {}) => {
  state.sliderPreview = { name, value: String(value) };
};

export const clearSliderPreview = ({ state }) => {
  state.sliderPreview = undefined;
};

export const selectHasSliderPreview = ({ state }) =>
  state.sliderPreview !== undefined;

// The images the canvas draws: the texture images, and the preview
// background.
export const selectCanvasImages = ({ state }) => {
  const imageItems = state.imagesData.items;
  const images = collectParticleTextureImageIds(
    selectCanvasEffectState(state),
    imageItems,
  ).map((imageId) => imageItems[imageId]);
  const backgroundImage = getImageItemById(
    state.imagesData,
    state.previewBackgroundImageId,
  );
  if (backgroundImage) {
    images.push(backgroundImage);
  }
  return images.filter((image) => image?.fileId);
};

// The image items the canvas may draw. An image whose file failed to load is
// left out: without its texture the particles do not draw, and without the
// background the canvas is black.
export const selectAvailableImageItems = ({ state }) =>
  Object.fromEntries(
    Object.entries(state.imagesData.items).filter(
      ([, item]) => !state.failedAssetFileIds.includes(item.fileId),
    ),
  );

// The preview background as picked. A picker shows its pick on the canvas
// at once, but the background keeps what it was until OK.
const selectPickedBackgroundImageId = (state) => {
  const { open, slot, originalImageId } = state.imageSelectorDialog;
  return open && slot === "background"
    ? originalImageId
    : state.previewBackgroundImageId;
};

const createPreviewSettings = (backgroundImageId) =>
  backgroundImageId ? { background: { imageId: backgroundImageId } } : {};

// The preview settings, when they differ from what is saved: the
// background, or none.
export const selectUnsavedPreviewSettings = ({ state }) => {
  const backgroundImageId = selectPickedBackgroundImageId(state);
  return backgroundImageId === state.savedPreviewBackgroundImageId
    ? undefined
    : createPreviewSettings(backgroundImageId);
};

export const markPreviewSettingsSaved = ({ state }, { preview } = {}) => {
  state.savedPreviewBackgroundImageId = preview.background?.imageId;
};

export const selectCanvasBackgroundImage = ({ state }) => {
  const image = getImageItemById(
    state.imagesData,
    state.previewBackgroundImageId,
  );
  return image && !state.failedAssetFileIds.includes(image.fileId)
    ? image
    : undefined;
};

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

const selectTextureImageState = (state) =>
  resolveParticleTextureImageItem(
    state.effect.modules.appearance?.texture,
    state.imagesData.items,
  );

export const selectIsImageSelectorOpen = ({ state }) =>
  state.imageSelectorDialog.open;

export const selectImageSelectorDialog = ({ state }) =>
  state.imageSelectorDialog;

export const openImageSelectorDialog = ({ state }, { slot } = {}) => {
  if (!IMAGE_SELECTOR_SLOTS.has(slot)) {
    return;
  }

  const imageId =
    slot === "texture"
      ? selectTextureImageState(state)?.id
      : state.previewBackgroundImageId;
  state.imageSelectorDialog.open = true;
  state.imageSelectorDialog.slot = slot;
  state.imageSelectorDialog.selectedImageId = imageId;
  state.imageSelectorDialog.originalImageId = imageId;
};

// The canvas shows a picked image at once: a background as the background,
// and a texture through selectCanvasEffect. Cancel puts the original back.
export const applyImageSelectorSelection = ({ state }, { imageId } = {}) => {
  state.imageSelectorDialog.selectedImageId = imageId;
  if (state.imageSelectorDialog.slot === "background") {
    state.previewBackgroundImageId = imageId;
  }
};

// Closes the picker on its picked image. The handler applies a picked
// texture to the effect as an edit.
export const closeImageSelectorDialog = ({ state }) => {
  state.imageSelectorDialog = createImageSelectorDialog();
};

export const cancelImageSelectorDialog = ({ state }) => {
  const { slot, originalImageId } = state.imageSelectorDialog;
  if (slot === "background") {
    state.previewBackgroundImageId = originalImageId;
  }
  state.imageSelectorDialog = createImageSelectorDialog();
  state.fullImagePreview = createFullImagePreview();
};

export const openBackgroundImageMenu = ({ state }, { x, y, items } = {}) => {
  state.backgroundImageMenu = createBackgroundImageMenu();
  if (!state.previewBackgroundImageId) {
    return;
  }

  state.backgroundImageMenu.isOpen = true;
  state.backgroundImageMenu.x = x;
  state.backgroundImageMenu.y = y;
  state.backgroundImageMenu.items = items ?? [];
};

export const closeBackgroundImageMenu = ({ state }) => {
  state.backgroundImageMenu = createBackgroundImageMenu();
};

export const clearPreviewBackgroundImage = ({ state }) => {
  state.previewBackgroundImageId = undefined;
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

const buildImageCard = (image) => {
  if (!image) {
    return undefined;
  }

  return {
    name: image.name,
    previewFileId: image.thumbnailFileId ?? image.fileId,
  };
};

// rtgl-form fills in only the fields that show when it mounts, so the key
// remounts it for a change to a field that decides which fields show, and
// when the form needs the particle's values again.
const buildFormKey = (state, formValues) =>
  [
    "particle-form",
    state.formRevision,
    ...PARTICLE_FORM_CONDITION_FIELDS.map((name) => formValues[name]),
  ].join("-");

export const selectViewData = ({ state, i18n }) => {
  const copy = selectParticleEditorPageCopy(i18n);
  const editHistoryCopy = selectEditHistoryCopy(i18n);
  const canvasResolution = {
    width: state.effect.width,
    height: state.effect.height,
  };
  const { canvasBackgroundStyle, canvasWrapperStyle } = buildEditorCanvasLayout(
    { state, resolution: canvasResolution },
  );
  const panelPlacement = buildEditorPanelPlacementViewData({ state });
  const { showRightPanel } = panelPlacement;
  const formValues = buildParticleFormValues({ particle: state.effect });
  const canvasParticle = createRenderableParticleData(
    selectCanvasEffectState(state),
    state.imagesData.items,
  );

  return {
    resourceCategory: "animatedAssets",
    selectedResourceId: "particle-editor",
    showExplorerPanel: !state.isTouchMode,
    ...panelPlacement,
    particleName: state.particleName,
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
    canvasAspectRatio: formatParticleAspectRatio(canvasResolution),
    // Without a texture the particles do not draw, so the canvas says so.
    showTextureHint: !hasRenderableParticleTexture(
      canvasParticle.modules?.appearance?.texture,
    ),
    textureHint: copy.textureHint,
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
    particleForm: createParticleForm({ copy }),
    particleFormKey: buildFormKey(state, formValues),
    formValues,
    sliderValueFields: buildParticleSliderValueFields({ formValues, copy }),
    textureImageLabel: copy.textureImageLabel,
    textureImageDescription: copy.textureImageDescription,
    textureImage: buildImageCard(selectTextureImageState(state)),
    backgroundImageLabel: copy.backgroundImageLabel,
    backgroundImageDescription: copy.backgroundImageDescription,
    backgroundImage: buildImageCard(
      getImageItemById(state.imagesData, state.previewBackgroundImageId),
    ),
    selectImageLabel: copy.selectImageOption,
    selectButton: copy.selectButton,
    imageSelectorDialog: state.imageSelectorDialog,
    showImageSelectorFileExplorer: !state.isTouchMode,
    imageFolderItems: toFlatItems(state.imagesData).filter(
      (item) => item.type === "folder",
    ),
    backgroundImageMenu: state.backgroundImageMenu,
    fullImagePreviewVisible: state.fullImagePreview.visible,
    fullImagePreviewFileId: state.fullImagePreview.fileId,
  };
};
