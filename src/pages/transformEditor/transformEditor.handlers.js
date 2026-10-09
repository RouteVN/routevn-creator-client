import { concatMap, debounceTime, filter, from, tap } from "rxjs";
import {
  applyTransformPositionIntent,
  createTransformKeyboardIntent,
} from "../../internal/transformKeyboard.js";
import { createTransformPreviewRenderState } from "../../internal/transformPreview.js";
import {
  createTransformEditorPayload,
  getTransformEditorBackPath,
  resolveTransformEditorPayload,
} from "../../internal/transformEditorRoute.js";
import { showAssetLoadFailures } from "../../internal/ui/assetLoadFeedback.js";
import { resolveEditHistoryShortcut } from "../../internal/ui/editHistory.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
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
  roundTransformScale,
} from "./support/transformEditorCanvas.js";
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

// Loads the preview images and character sprites the canvas has not loaded,
// each on its own, and returns the ones that failed. A failed image stays out
// of the canvas, and is not read again while the page is open.
const loadPreviewImageAssets = async (deps) => {
  const { graphicsService, projectService, store } = deps;
  const loadedFileIds = store.selectLoadedAssetFileIds();
  const failedFileIds = store.selectFailedAssetFileIds();
  const images = new Map();
  for (const image of [
    store.selectPreviewBackgroundImage(),
    store.selectPreviewTargetImage(),
    ...store.selectPreviewTargetCharacterSprites(),
  ]) {
    if (
      image?.fileId &&
      !loadedFileIds.includes(image.fileId) &&
      !failedFileIds.includes(image.fileId)
    ) {
      images.set(image.fileId, image);
    }
  }

  const failures = [];
  for (const [fileId, image] of images) {
    try {
      // As in the layout and scene editors, an image must match its saved
      // size and hash.
      const fileResult = await projectService.getFileContent(fileId, {
        verifyImageIntegrity: true,
      });
      await graphicsService.loadAssets({
        [fileId]: {
          url: fileResult.url,
          type: image.fileType ?? fileResult.type ?? "image/png",
        },
      });
      store.markAssetLoaded({ fileId });
    } catch (error) {
      console.warn("[transformEditor] Failed to load a preview image", {
        fileId,
        error,
      });
      store.markAssetFailed({ fileId });
      failures.push({ fileId, imageName: image.name, error });
    }
  }
  return failures;
};

// Renders can overlap, so each failed file is warned about once while the
// page is open, as in the layout editor.
const warnPreviewImageFailures = (deps, failures) => {
  const { store } = deps;
  const warnedFileIds = store.selectWarnedAssetFileIds();
  const newFailures = failures.filter(
    ({ fileId }) => !warnedFileIds.includes(fileId),
  );
  if (newFailures.length === 0) {
    return;
  }

  store.markAssetWarningsShown({
    fileIds: newFailures.map(({ fileId }) => fileId),
  });
  showAssetLoadFailures(deps, newFailures);
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

// The canvas as Edit shows it, without the selection outline.
const createPreviewRenderState = (store) =>
  createTransformPreviewRenderState({
    projectResolution: store.selectProjectResolution(),
    transform: store.selectTransform(),
    backgroundImage: store.selectCanvasBackgroundImage(),
    targetImage: store.selectCanvasTargetImage(),
    targetCharacterSprites: store.selectCanvasTargetCharacterSprites(),
  });

// Edit draws the transform with its selection outline; Preview draws the
// same canvas without it, which is what the thumbnail shows. Every render
// reads the store, so a later render shows the latest values. A preview
// image that cannot load is warned about once and left out, and the canvas
// stays editable.
const renderTransformCanvas = async (deps) => {
  const { appService, graphicsService, store } = deps;
  if (!store.selectTransformId()) {
    return;
  }

  try {
    warnPreviewImageFailures(deps, await loadPreviewImageAssets(deps));
    if (store.selectRightPanelMode() === "preview") {
      graphicsService.render(createPreviewRenderState(store));
      return;
    }

    const { renderState, selectedElementMetrics } =
      createTransformEditorCanvasState({
        graphicsService,
        projectResolution: store.selectProjectResolution(),
        transform: store.selectCanvasTransform(),
        backgroundImage: store.selectCanvasBackgroundImage(),
        targetImage: store.selectCanvasTargetImage(),
        targetCharacterSprites: store.selectCanvasTargetCharacterSprites(),
        canvasUnitsPerCssPixel: selectCanvasUnitsPerCssPixel(deps),
      });
    graphicsService.render(renderState);
    store.setSelectedElementMetrics({ metrics: selectedElementMetrics });
  } catch (error) {
    console.error("[transformEditor] Failed to render the canvas", error);
    appService.showToast({ message: selectCopy(deps).failedRenderPreview });
  }
};

// Saves the transform's values and preview images, whichever differ from
// what is saved. Saves run one at a time, so a save on leaving waits for a
// running autosave and then saves what it missed.
const saveTransformChanges = (deps) => {
  const { appService, projectService, store } = deps;
  return enqueueSceneEditorPersistence({
    owner: projectService,
    task: async () => {
      const changes = store.selectUnsavedChanges();
      if (!changes.transform && !changes.preview) {
        return true;
      }

      const data = {};
      if (changes.transform) {
        Object.assign(data, changes.transform);
      }
      if (changes.preview) {
        data.preview = changes.preview;
      }
      const updateAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: selectCopy(deps).failedSaveTransform,
        action: () =>
          projectService.updateTransform({
            transformId: store.selectTransformId(),
            data,
          }),
      });
      if (updateAttempt.ok) {
        store.markChangesSaved(changes);
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
  const { refs, store } = deps;
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
  // The inspector shows the values while dragging, without rendering the
  // page; the page renders when the drag ends.
  refs.transformInspector.setTransientValues({
    values: {
      x: nextTransform.x,
      y: nextTransform.y,
      scaleX: nextTransform.scaleX,
      scaleY: nextTransform.scaleY,
    },
  });
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
        concatMap(() => from(saveTransformChanges(deps))),
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
  const {
    appService,
    browserEventsClient,
    graphicsService,
    projectService,
    render,
    store,
    uiConfig,
    windowMetricsClient,
  } = deps;
  store.setUiConfig({ uiConfig });
  const cleanupSubscriptions = mountSubscriptions(deps);
  // Turning a tablet moves the Edit and Preview panel between the right
  // side and under the canvas.
  const cleanupWindowLayout = mountMobileResourceWindowLayout({
    windowMetricsClient,
    store,
    render: () => {
      render();
      void renderTransformCanvas(deps);
    },
  });
  const cleanupWindowResize = browserEventsClient.subscribeWindowEvent({
    type: "resize",
    listener: () => renderTransformCanvas(deps),
  });
  const cleanupKeyboardShortcuts = browserEventsClient.subscribeWindowEvent({
    type: "keydown",
    options: { capture: true },
    listener: (event) => handleWindowKeyDown(deps, { _event: event }),
  });
  // Leaving saves waiting edits, then has the thumbnail brought up to date
  // in the background, so leaving waits only for the save. A backup keeps
  // the page open, so it only saves.
  const unregisterBeforeNavigation = appService.registerBeforeNavigation(
    async ({ reason } = {}) => {
      const saved = await saveTransformChanges(deps);
      if (!saved) {
        throw new Error("Failed to save transform before navigation.");
      }
      const transformId = store.selectTransformId();
      // Only leaving the page draws its thumbnail. A backup, the app going to
      // the background, or quitting only saves.
      if (transformId && !reason) {
        void projectService.requestTransformThumbnails({
          transformIds: [transformId],
        });
      }
    },
  );

  return async () => {
    unregisterBeforeNavigation();
    cleanupSubscriptions();
    cleanupWindowLayout?.();
    cleanupWindowResize();
    cleanupKeyboardShortcuts();
    // The graphics service is shared, and the next page can start its
    // renderer while the save below runs, so this page's goes first.
    void graphicsService.destroy();
    const saved = await saveTransformChanges(deps);
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
    charactersData: repositoryState.characters,
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
    store.selectIsPreviewPickerOpen() ||
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
  const saved = await saveTransformChanges(deps);
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

// The inspector's events name the field that changed. Only that field, and
// the fields it moves with it (the other scale while the aspect ratio is
// kept), apply, since the inspector's other values may be older than the
// canvas.
const selectInspectorTransform = (store, { name, value, linkedValues }) => {
  const changes = { [name]: value };
  Object.assign(changes, linkedValues);
  return createTransformFromInspectorValues(store.selectTransform(), changes);
};

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

// A picked or removed preview image saves on its own, as an edit does, but
// is not part of the undo history.
const commitPreviewChange = async (deps) => {
  const { render } = deps;
  queueTransformAutosave(deps);
  render();
  await renderTransformCanvas(deps);
};

// The target can be an image or a character sprite, so its card first asks
// which; the background is an image.
export const handlePreviewImageClick = (deps, payload) => {
  const { render, store } = deps;
  const copy = selectCopy(deps);
  const event = payload._event;
  const { slot } = event.currentTarget.dataset;
  store.closePreviewImageMenu();
  if (slot === "target") {
    store.openPreviewImageMenu({
      slot,
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: copy.imageOption, type: "item", value: "image" },
        {
          label: copy.characterSpriteOption,
          type: "item",
          value: "character-sprite",
        },
      ],
    });
  } else {
    store.openImageSelectorDialog({ slot });
  }
  render();
};

export const handlePreviewImageContextMenu = (deps, payload) => {
  const { render, store } = deps;
  const copy = selectCopy(deps);
  const event = payload._event;
  const { slot } = event.currentTarget.dataset;
  event.preventDefault();
  event.stopPropagation();
  if (!store.selectHasPreviewVisual({ slot })) {
    return;
  }
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
    await commitPreviewChange(deps);
    return;
  }
  if (item.value === "image") {
    store.openImageSelectorDialog({ slot });
  } else if (item.value === "character-sprite") {
    store.openCharacterSpriteDialog();
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
  const { store } = deps;
  store.commitImageSelectorSelection();
  await commitPreviewChange(deps);
};

export const handleCharacterSpriteSelectionChange = async (deps, payload) => {
  const { render, store } = deps;
  const { selection } = payload._event.detail;
  store.applyCharacterSpriteSelection({ selection });
  render();
  await renderTransformCanvas(deps);
};

export const handleCharacterSpriteDialogClose = async (deps) => {
  const { render, store } = deps;
  store.cancelCharacterSpriteDialog();
  render();
  await renderTransformCanvas(deps);
};

export const handleCharacterSpriteConfirmClick = async (deps) => {
  const { store } = deps;
  store.commitCharacterSpriteSelection();
  await commitPreviewChange(deps);
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
