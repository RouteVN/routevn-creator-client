import { concatMap, debounceTime, filter, from, tap } from "rxjs";
import {
  applyTransformPositionIntent,
  createTransformKeyboardIntent,
} from "../../internal/transformKeyboard.js";
import {
  createTransformEditorPayload,
  getTransformEditorBackPath,
  resolveTransformEditorPayload,
} from "../../internal/transformEditorRoute.js";
import { resolveEditHistoryShortcut } from "../../internal/ui/editHistory.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { enqueueSceneEditorPersistence } from "../../internal/ui/sceneEditor/persistenceQueue.js";
import {
  applyBackgroundTransformDragChange,
  applyBackgroundTransformResizeChange,
  getBackgroundTransformDragModeFromTargetId,
  isBackgroundTransformResizeMode,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";
import {
  createTransformEditorCanvasState,
  createTransformFromInspectorValues,
  createTransformPreviewRenderState,
  roundTransformScale,
} from "./support/transformEditorCanvas.js";
import { captureTransformPreviewFiles } from "./support/transformEditorPreviewCapture.js";
import { selectTransformEditorPageCopy } from "./support/transformEditorPageCopy.js";

const selectCopy = ({ i18n } = {}) => selectTransformEditorPageCopy(i18n);

// Edits save on their own once the values have been still this long.
const AUTOSAVE_DEBOUNCE_MS = 300;
const AUTOSAVE_ACTION = "transformEditor.autosave";

const {
  focusKeyboardScope: focusImageSelectorKeyboardScope,
  handleKeyboardScopeClick: handleImageSelectorKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleImageSelectorKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  fileExplorerRefName: "imageSelectorFileExplorer",
  keyboardScopeRefName: "imageSelectorKeyboardScope",
});

export {
  handleImageSelectorKeyboardScopeClick,
  handleImageSelectorKeyboardScopeKeyDown,
};

const navigateBack = (appService) => {
  appService.navigate(
    getTransformEditorBackPath(),
    createTransformEditorPayload({
      payload: appService.getPayload() ?? {},
    }),
    { historyMode: "replace" },
  );
};

const loadPreviewImageAssets = async (deps) => {
  const { graphicsService, projectService, store } = deps;
  const loadedFileIds = store.selectLoadedAssetFileIds();
  const images = [
    store.selectPreviewBackgroundImage(),
    store.selectPreviewTargetImage(),
  ].filter((image) => image?.fileId && !loadedFileIds.includes(image.fileId));
  if (images.length === 0) {
    return;
  }

  const assets = {};
  for (const image of images) {
    const fileResult = await projectService.getFileContent(image.fileId);
    assets[image.fileId] = {
      url: fileResult.url,
      type: image.fileType ?? fileResult.type ?? "image/png",
    };
  }
  await graphicsService.loadAssets(assets);
  store.addLoadedAssetFileIds({
    fileIds: images.map((image) => image.fileId),
  });
};

// Canvas units per CSS pixel, so the outline's handles keep their on-screen
// size at any zoom.
const selectCanvasUnitsPerCssPixel = (deps) => {
  const { refs, store } = deps;
  const canvasWidth = refs.canvas.getBoundingClientRect().width;
  return canvasWidth > 0
    ? store.selectProjectResolution().width / canvasWidth
    : 1;
};

// What Save Preview saves: the canvas as Edit shows it, without the
// selection outline.
const createSavedPreviewRenderState = (store) =>
  createTransformPreviewRenderState({
    projectResolution: store.selectProjectResolution(),
    transform: store.selectTransform(),
    backgroundImage: store.selectPreviewBackgroundImage(),
    targetImage: store.selectPreviewTargetImage(),
  });

// Edit draws the transform with its selection outline; Preview draws the
// same canvas without it, which is what Save Preview saves. Every render
// reads the store, so a later render shows the latest values.
const renderTransformCanvas = async (deps) => {
  const { appService, graphicsService, store } = deps;
  if (!store.selectTransformId()) {
    return;
  }

  try {
    await loadPreviewImageAssets(deps);
    if (store.selectRightPanelMode() === "preview") {
      graphicsService.render(createSavedPreviewRenderState(store));
      return;
    }

    const { renderState, selectedElementMetrics } =
      createTransformEditorCanvasState({
        graphicsService,
        projectResolution: store.selectProjectResolution(),
        transform: store.selectCanvasTransform(),
        backgroundImage: store.selectPreviewBackgroundImage(),
        targetImage: store.selectPreviewTargetImage(),
        canvasUnitsPerCssPixel: selectCanvasUnitsPerCssPixel(deps),
      });
    graphicsService.render(renderState);
    store.setSelectedElementMetrics({ metrics: selectedElementMetrics });
  } catch (error) {
    console.error("[transformEditor] Failed to render the canvas", error);
    appService.showToast({ message: selectCopy(deps).failedRenderPreview });
  }
};

// Saves the transform's values when they differ from what is saved. Saves
// run one at a time, so a save on leaving waits for a running autosave and
// then saves what it missed.
const saveTransformValues = (deps) => {
  const { appService, projectService, store } = deps;
  return enqueueSceneEditorPersistence({
    owner: projectService,
    task: async () => {
      if (!store.selectHasUnsavedValues()) {
        return true;
      }

      const transform = store.selectTransform();
      const updateAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: selectCopy(deps).failedSaveTransform,
        action: () =>
          projectService.updateTransform({
            transformId: store.selectTransformId(),
            data: transform,
          }),
      });
      if (updateAttempt.ok) {
        store.markValuesSaved({ transform });
      }
      return updateAttempt.ok;
    },
  });
};

const queueTransformAutosave = ({ subject }) => {
  subject.dispatch(AUTOSAVE_ACTION, {});
};

// Every edit to the transform ends here, so this is where it enters the undo
// history.
const commitTransformEdit = async (deps) => {
  const { render, store } = deps;
  store.recordTransformEdit({ time: Date.now() });
  queueTransformAutosave(deps);
  render();
  await renderTransformCanvas(deps);
};

const handleBorderDragStart = (deps, payload = {}) => {
  const { store } = deps;
  if (getBackgroundTransformDragModeFromTargetId(payload.targetId)) {
    store.clearDragStartPosition();
  }
};

const handleBorderDragMove = (deps, payload = {}) => {
  const { store } = deps;
  const dragMode = getBackgroundTransformDragModeFromTargetId(payload.targetId);
  if (!dragMode || typeof payload.x !== "number") {
    return;
  }

  const transform = store.selectTransform();
  const dragStartPosition = store.selectDragStartPosition();
  if (!dragStartPosition) {
    const resizeEdge = isBackgroundTransformResizeMode(dragMode)
      ? dragMode
      : undefined;
    const selectedElementMetrics = store.selectSelectedElementMetrics();
    if (resizeEdge && !selectedElementMetrics) {
      return;
    }
    store.setDragStartPosition({
      dragStartPosition: {
        x: payload.x,
        y: payload.y,
        resizeEdge,
        selectedElementMetrics,
        transformStartX: transform.x,
        transformStartY: transform.y,
        transformStartScaleX: transform.scaleX,
        transformStartScaleY: transform.scaleY,
      },
    });
    return;
  }

  const change = {
    transform,
    dragStartPosition,
    x: payload.x,
    y: payload.y,
  };
  const nextTransform = dragStartPosition.resizeEdge
    ? roundTransformScale(applyBackgroundTransformResizeChange(change))
    : applyBackgroundTransformDragChange(change);
  store.setTransform({ transform: nextTransform });
  void renderTransformCanvas(deps);
};

// A drag is one edit, from where it started to where it ended.
const handleBorderDragEnd = async (deps) => {
  const { store } = deps;
  if (!store.selectDragStartPosition()) {
    return;
  }
  store.clearDragStartPosition();
  await commitTransformEdit(deps);
};

const mountSubscriptions = (deps) => {
  const { subject } = deps;
  const subscriptions = [
    subject
      .pipe(
        filter(({ action }) => action === AUTOSAVE_ACTION),
        debounceTime(AUTOSAVE_DEBOUNCE_MS),
        concatMap(() => from(saveTransformValues(deps))),
      )
      .subscribe(),
    subject
      .pipe(
        filter(({ action }) => action === "border-drag-start"),
        tap(({ payload }) => handleBorderDragStart(deps, payload)),
      )
      .subscribe(),
    subject
      .pipe(
        filter(({ action }) => action === "border-drag-move"),
        tap(({ payload }) => handleBorderDragMove(deps, payload)),
      )
      .subscribe(),
    subject
      .pipe(
        filter(({ action }) => action === "border-drag-end"),
        tap(() => handleBorderDragEnd(deps)),
      )
      .subscribe(),
  ];
  return () =>
    subscriptions.forEach((subscription) => subscription.unsubscribe());
};

export const handleBeforeMount = (deps) => {
  const { appService, browserEventsClient, graphicsService, store, uiConfig } =
    deps;
  store.setUiConfig({ uiConfig });
  const cleanupSubscriptions = mountSubscriptions(deps);
  const cleanupWindowResize = browserEventsClient.subscribeWindowEvent({
    type: "resize",
    listener: () => renderTransformCanvas(deps),
  });
  const cleanupKeyboardShortcuts = browserEventsClient.subscribeWindowEvent({
    type: "keydown",
    options: { capture: true },
    listener: (event) => handleWindowKeyDown(deps, { _event: event }),
  });
  // Unsaved preview settings are left behind, as in the layout editor.
  const unregisterBeforeNavigation = appService.registerBeforeNavigation(
    async () => {
      const saved = await saveTransformValues(deps);
      if (!saved) {
        throw new Error("Failed to save transform before navigation.");
      }
    },
  );

  return async () => {
    unregisterBeforeNavigation();
    cleanupSubscriptions();
    cleanupWindowResize();
    cleanupKeyboardShortcuts();
    const saved = await saveTransformValues(deps);
    void graphicsService.destroy();
    if (!saved) {
      throw new Error("Failed to save transform during cleanup.");
    }
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, graphicsService, projectService, refs, render, store } =
    deps;
  const copy = selectCopy(deps);
  await projectService.ensureRepository();
  const { transformId } = resolveTransformEditorPayload(
    appService.getPayload() ?? {},
  );
  const repositoryState = projectService.getRepositoryState();
  const item = repositoryState.transforms?.items?.[transformId];
  if (item?.type !== "transform") {
    appService.showAlert({
      title: copy.errorTitle,
      message: copy.transformNotFound,
    });
    navigateBack(appService);
    return;
  }

  store.loadTransform({
    item,
    projectResolution: repositoryState.project?.resolution,
    imagesData: repositoryState.images,
  });
  render();

  const projectResolution = store.selectProjectResolution();
  await graphicsService.init({
    canvas: refs.canvas,
    width: projectResolution.width,
    height: projectResolution.height,
  });
  await renderTransformCanvas(deps);
};

// Undo and redo behave like an edit: the page shows the restored transform
// at once and saves it a moment after. An undo back to the saved transform
// leaves nothing to save.
const runTransformHistoryStep = async (deps, direction) => {
  const { render, store } = deps;
  if (!store.selectEditHistoryStep({ direction })) {
    return;
  }
  store.applyEditHistoryStep({ direction });
  queueTransformAutosave(deps);
  render();
  await renderTransformCanvas(deps);
};

export const handleUndoButtonClick = (deps) =>
  runTransformHistoryStep(deps, "undo");

export const handleRedoButtonClick = (deps) =>
  runTransformHistoryStep(deps, "redo");

// Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z redoes; the arrow keys move the
// target, ten pixels at a time with Shift. Both step aside for text fields.
export const handleWindowKeyDown = async (deps, payload) => {
  const { appService, store } = deps;
  const event = payload._event;
  const direction = resolveEditHistoryShortcut(event);
  if (direction) {
    event.preventDefault();
    await runTransformHistoryStep(deps, direction);
    return;
  }

  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    appService.isInputFocused() ||
    store.selectIsImageSelectorOpen() ||
    store.selectRightPanelMode() !== "edit"
  ) {
    return;
  }

  const intent = createTransformKeyboardIntent({
    key: event.key,
    shiftKey: event.shiftKey,
  });
  if (!intent) {
    return;
  }

  event.preventDefault();
  store.setTransform({
    transform: applyTransformPositionIntent(store.selectTransform(), intent),
  });
  await commitTransformEdit(deps);
};

export const handleBackClick = async (deps) => {
  const { appService } = deps;
  const saved = await saveTransformValues(deps);
  if (saved) {
    navigateBack(appService);
  }
};

export const handleRightPanelModeChange = async (deps, payload) => {
  const { render, store } = deps;
  const { id } = payload._event.detail;
  store.setRightPanelMode({ mode: id });
  render();
  await renderTransformCanvas(deps);
};

// Saves the preview images and a new preview and thumbnail image of the
// transform, drawn as Preview shows it. The transform's values save first.
export const handleSavePreviewClick = async (deps) => {
  const { appService, graphicsService, projectService, refs, store } = deps;
  const copy = selectCopy(deps);
  if (!(await saveTransformValues(deps))) {
    return;
  }

  await loadPreviewImageAssets(deps);
  const previewFiles = await captureTransformPreviewFiles({
    graphicsService,
    projectService,
    canvas: refs.canvas,
    renderState: createSavedPreviewRenderState(store),
  });
  if (!previewFiles) {
    await renderTransformCanvas(deps);
    appService.showAlert({
      title: copy.errorTitle,
      message: copy.failedCapturePreview,
    });
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedSavePreview,
    action: () =>
      projectService.updateTransform({
        transformId: store.selectTransformId(),
        data: {
          thumbnailFileId: previewFiles.thumbnailFileId,
          previewFileId: previewFiles.previewFileId,
          preview: store.selectPreviewData(),
        },
        fileRecords: previewFiles.fileRecords,
      }),
  });
  await renderTransformCanvas(deps);
  if (updateAttempt.ok) {
    appService.showToast({ message: copy.transformPreviewSaved });
  }
};

// rvn-zoom-viewport keeps the point in view in place when the zoom changes.
export const handleCanvasZoomInClick = async (deps) => {
  const { render, store } = deps;
  store.zoomCanvasIn();
  render();
  await renderTransformCanvas(deps);
};

export const handleCanvasZoomOutClick = async (deps) => {
  const { render, store } = deps;
  store.zoomCanvasOut();
  render();
  await renderTransformCanvas(deps);
};

export const handleCanvasZoomResetClick = async (deps) => {
  const { refs, render, store } = deps;
  store.resetCanvasZoom();
  render();
  refs.canvasBackground.centerContent();
  await renderTransformCanvas(deps);
};

export const handleCanvasZoomGesture = async (deps, payload) => {
  const { render, store } = deps;
  const { zoom } = payload._event.detail;
  store.setCanvasZoom({ zoom });
  render();
  await renderTransformCanvas(deps);
};

// The inspector's events name the field that changed. Only that field
// applies, since the inspector's other values may be older than the canvas.
const selectInspectorTransform = (store, { name, value }) =>
  createTransformFromInspectorValues(store.selectTransform(), {
    [name]: value,
  });

export const handleInspectorUpdate = async (deps, payload) => {
  const { store } = deps;
  store.clearInspectorPreviewTransform();
  store.setTransform({
    transform: selectInspectorTransform(store, payload._event.detail),
  });
  await commitTransformEdit(deps);
};

// Number fields preview on the canvas while their popover is open; closing
// it without submitting puts the transform back.
export const handleInspectorPreview = async (deps, payload) => {
  const { store } = deps;
  store.setInspectorPreviewTransform({
    transform: selectInspectorTransform(store, payload._event.detail),
  });
  await renderTransformCanvas(deps);
};

export const handleInspectorPreviewCancel = async (deps) => {
  const { store } = deps;
  store.clearInspectorPreviewTransform();
  await renderTransformCanvas(deps);
};

export const handlePreviewImageClick = (deps, payload) => {
  const { render, store } = deps;
  const { slot } = payload._event.currentTarget.dataset;
  store.closePreviewImageMenu();
  store.openImageSelectorDialog({ slot });
  render();
};

export const handlePreviewImageContextMenu = (deps, payload) => {
  const { render, store } = deps;
  const copy = selectCopy(deps);
  const event = payload._event;
  const { slot } = event.currentTarget.dataset;
  event.preventDefault();
  event.stopPropagation();
  store.openPreviewImageMenu({
    slot,
    x: event.clientX,
    y: event.clientY,
    items: [{ label: copy.removeMenuItem, type: "item", value: "remove" }],
  });
  render();
};

export const handlePreviewImageMenuClose = (deps) => {
  const { render, store } = deps;
  store.closePreviewImageMenu();
  render();
};

export const handlePreviewImageMenuItemClick = async (deps, payload) => {
  const { render, store } = deps;
  const { item } = payload._event.detail;
  const slot = store.selectPreviewImageMenuSlot();
  store.closePreviewImageMenu();
  if (item.value === "remove") {
    store.clearPreviewImage({ slot });
  }
  render();
  await renderTransformCanvas(deps);
};

export const handleImageSelectorImageSelected = async (deps, payload) => {
  const { render, store } = deps;
  const { imageId } = payload._event.detail;
  store.applyImageSelectorSelection({ imageId });
  render();
  await renderTransformCanvas(deps);
};

export const handleImageSelectorImageDoubleClick = (deps, payload) => {
  const { render, store } = deps;
  const { imageId } = payload._event.detail;
  store.showFullImagePreview({ imageId });
  render();
};

export const handleImageSelectorDialogClose = async (deps) => {
  const { render, store } = deps;
  store.cancelImageSelectorDialog();
  render();
  await renderTransformCanvas(deps);
};

export const handleImageSelectorConfirmClick = async (deps) => {
  const { render, store } = deps;
  store.commitImageSelectorSelection();
  render();
  await renderTransformCanvas(deps);
};

export const handleImageSelectorFileExplorerItemClick = (deps, payload) => {
  const { refs } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  refs.imageSelector.transformedHandlers.handleScrollToItem({ itemId });
  focusImageSelectorKeyboardScope(deps);
};

export const handleFullImagePreviewClose = (deps) => {
  const { render, store } = deps;
  store.hideFullImagePreview();
  render();
};
