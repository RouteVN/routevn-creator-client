import { auditTime, concatMap, debounceTime, filter, from, tap } from "rxjs";
import {
  createParticleEditorPayload,
  getParticleEditorBackPath,
  resolveParticleEditorPayload,
} from "../../internal/particleEditorRoute.js";
import { showAssetLoadFailures } from "../../internal/ui/assetLoadFeedback.js";
import { resolveEditHistoryShortcut } from "../../internal/ui/editHistory.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { enqueueSceneEditorPersistence } from "../../internal/ui/sceneEditor/persistenceQueue.js";
import {
  PARTICLE_SOURCE_OUTLINE_ID,
  createParticleEditorRenderState,
  createParticlePreviewRenderState,
  moveParticleSource,
} from "./support/particleEditorCanvas.js";
import {
  applyParticleFormChange,
  replaceParticleSource,
  replaceParticleTextureImage,
} from "./support/particleEditorForm.js";
import { selectParticleEditorPageCopy } from "./support/particleEditorPageCopy.js";

const selectCopy = ({ i18n } = {}) => selectParticleEditorPageCopy(i18n);

// Edits save on their own once the values have been still this long.
const AUTOSAVE_DEBOUNCE_MS = 300;
const AUTOSAVE_ACTION = "particleEditor.autosave";
const SLIDER_PREVIEW_ACTION = "particleEditor.sliderPreview";
// A slider moving fast shows on the canvas about once a frame, with its
// latest value.
const SLIDER_PREVIEW_INTERVAL_MS = 16;

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
    getParticleEditorBackPath(),
    createParticleEditorPayload({
      payload: appService.getPayload() ?? {},
    }),
    { historyMode: "replace" },
  );
};

// The renderer draws at the particle's size, in whole pixels.
const toCanvasSize = (effect) => ({
  width: Math.max(1, Math.round(effect.width)),
  height: Math.max(1, Math.round(effect.height)),
});

// Starts the canvas renderer at the particle's size, and again when the size
// changes.
const ensureGraphicsSize = async (deps) => {
  const { graphicsService, refs, store } = deps;
  const { width, height } = toCanvasSize(store.selectEffect());
  const graphicsSize = store.selectGraphicsSize();
  if (graphicsSize?.width === width && graphicsSize?.height === height) {
    return;
  }

  store.setGraphicsSize({ width, height });
  await graphicsService.init({ canvas: refs.canvas, width, height });
};

// Loads the images the canvas has not loaded, each on its own, and returns
// the ones that failed. A failed image stays out of the canvas, and renders
// do not read it again while the page is open.
const loadCanvasImages = async (deps) => {
  const { graphicsService, projectService, store } = deps;
  const loadedFileIds = store.selectLoadedAssetFileIds();
  const failedFileIds = store.selectFailedAssetFileIds();
  const images = new Map();
  for (const image of store.selectCanvasImages()) {
    if (
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
      console.warn("[particleEditor] Failed to load an image", {
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
const warnCanvasImageFailures = (deps, failures) => {
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

// Canvas units per CSS pixel, so the outline keeps its on-screen size at any
// zoom.
const selectCanvasUnitsPerCssPixel = (deps) => {
  const { refs, store } = deps;
  const canvasWidth = refs.canvas.getBoundingClientRect().width;
  return canvasWidth > 0 ? store.selectEffect().width / canvasWidth : 1;
};

// What Preview draws, as the thumbnail does: the canvas without the source
// outline, with the preview background.
const createSavedPreviewRenderState = (store) =>
  createParticlePreviewRenderState({
    effect: store.selectCanvasEffect(),
    imageItems: store.selectAvailableImageItems(),
    backgroundImage: store.selectCanvasBackgroundImage(),
  });

// Edit draws the particle with its source outline; Preview draws the same
// canvas without it, which is what the thumbnail shows. Every render reads
// the store, so a later render shows the latest values. An image that cannot
// load is warned about once and left out, and the canvas stays editable.
const renderParticleCanvas = async (deps) => {
  const { appService, graphicsService, store } = deps;
  if (!store.selectParticleId()) {
    return;
  }

  try {
    await ensureGraphicsSize(deps);
    warnCanvasImageFailures(deps, await loadCanvasImages(deps));
    if (!store.selectShowsSourceOutline()) {
      graphicsService.render(createSavedPreviewRenderState(store));
      return;
    }

    graphicsService.render(
      createParticleEditorRenderState({
        effect: store.selectCanvasEffect(),
        imageItems: store.selectAvailableImageItems(),
        backgroundImage: store.selectCanvasBackgroundImage(),
        canvasUnitsPerCssPixel: selectCanvasUnitsPerCssPixel(deps),
      }),
    );
  } catch (error) {
    console.error("[particleEditor] Failed to render the canvas", error);
    appService.showToast({ message: selectCopy(deps).failedRenderPreview });
  }
};

// Saves the particle's effect (its size, seed and modules, never its name)
// and its preview background, whichever differ from what is saved. Saves run
// one at a time, so a save on leaving waits for a running autosave and then
// saves what it missed.
const saveParticleChanges = (deps) => {
  const { appService, projectService, store } = deps;
  return enqueueSceneEditorPersistence({
    owner: projectService,
    task: async () => {
      const hasUnsavedValues = store.selectHasUnsavedValues();
      const preview = store.selectUnsavedPreviewSettings();
      if (!hasUnsavedValues && !preview) {
        return true;
      }

      const effect = store.selectEffect();
      const data = {};
      if (hasUnsavedValues) {
        Object.assign(data, effect);
      }
      if (preview) {
        data.preview = preview;
      }
      const updateAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: selectCopy(deps).failedSaveParticle,
        action: () =>
          projectService.updateParticle({
            particleId: store.selectParticleId(),
            data,
          }),
      });
      if (updateAttempt.ok) {
        if (hasUnsavedValues) {
          store.markValuesSaved({ effect });
        }
        if (preview) {
          store.markPreviewSettingsSaved({ preview });
        }
      }
      return updateAttempt.ok;
    },
  });
};

const queueParticleAutosave = ({ subject }) => {
  subject.dispatch(AUTOSAVE_ACTION, {});
};

// Every edit to the particle ends here, so this is where it enters the undo
// history.
const commitParticleEdit = async (deps, { merge = true } = {}) => {
  const { render, store } = deps;
  store.recordParticleEdit({ time: Date.now(), merge });
  queueParticleAutosave(deps);
  render();
  await renderParticleCanvas(deps);
};

const handleBorderDragStart = (deps, payload = {}) => {
  const { store } = deps;
  if (payload.targetId === PARTICLE_SOURCE_OUTLINE_ID) {
    store.clearDragStartPosition();
  }
};

// Dragging the outline moves the source by as much as the pointer moved.
const handleBorderDragMove = (deps, payload = {}) => {
  const { store } = deps;
  if (
    payload.targetId !== PARTICLE_SOURCE_OUTLINE_ID ||
    typeof payload.x !== "number" ||
    !store.selectShowsSourceOutline()
  ) {
    return;
  }

  const effect = store.selectEffect();
  const dragStartPosition = store.selectDragStartPosition();
  if (!dragStartPosition) {
    store.setDragStartPosition({
      dragStartPosition: {
        x: payload.x,
        y: payload.y,
        source: effect.modules.emission.source,
      },
    });
    return;
  }

  const source = moveParticleSource(dragStartPosition.source, {
    dx: payload.x - dragStartPosition.x,
    dy: payload.y - dragStartPosition.y,
  });
  store.setEffect({ effect: replaceParticleSource(effect, source) });
  void renderParticleCanvas(deps);
};

// A drag is one edit, from where it started to where it ended, and always
// its own step. The form then shows the source's new position.
const handleBorderDragEnd = async (deps) => {
  const { store } = deps;
  if (!store.selectDragStartPosition()) {
    return;
  }
  store.clearDragStartPosition();
  store.refreshForm();
  await commitParticleEdit(deps, { merge: false });
};

const mountSubscriptions = (deps) => {
  const { store, subject } = deps;
  const subscriptions = [
    subject
      .pipe(
        filter(({ action }) => action === AUTOSAVE_ACTION),
        debounceTime(AUTOSAVE_DEBOUNCE_MS),
        concatMap(() => from(saveParticleChanges(deps))),
      )
      .subscribe(),
    subject
      .pipe(
        filter(({ action }) => action === SLIDER_PREVIEW_ACTION),
        auditTime(SLIDER_PREVIEW_INTERVAL_MS),
        // Submit and close draw the canvas themselves.
        filter(() => store.selectHasSliderPreview()),
        tap(() => renderParticleCanvas(deps)),
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
      void renderParticleCanvas(deps);
    },
  });
  const cleanupWindowResize = browserEventsClient.subscribeWindowEvent({
    type: "resize",
    listener: () => renderParticleCanvas(deps),
  });
  const cleanupKeyboardShortcuts = browserEventsClient.subscribeWindowEvent({
    type: "keydown",
    options: { capture: true },
    listener: (event) => handleWindowKeyDown(deps, { _event: event }),
  });
  // Leaving saves waiting changes, then has the thumbnail brought up to date
  // in the background, so leaving waits only for the save. A backup keeps
  // the page open, so it only saves.
  const unregisterBeforeNavigation = appService.registerBeforeNavigation(
    async ({ reason } = {}) => {
      const saved = await saveParticleChanges(deps);
      if (!saved) {
        throw new Error("Failed to save particle before navigation.");
      }
      const particleId = store.selectParticleId();
      // Only leaving the page draws its thumbnail. A backup, the app going to
      // the background, or quitting only saves.
      if (particleId && !reason) {
        void projectService.requestParticleThumbnails({
          particleIds: [particleId],
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
    const saved = await saveParticleChanges(deps);
    if (!saved) {
      throw new Error("Failed to save particle during cleanup.");
    }
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  await projectService.ensureRepository();
  const { particleId } = resolveParticleEditorPayload(
    appService.getPayload() ?? {},
  );
  const repositoryState = projectService.getRepositoryState();
  const item = repositoryState.particles?.items?.[particleId];
  if (item?.type !== "particle") {
    appService.showAlert({
      title: copy.errorTitle,
      message: copy.particleNotFound,
    });
    navigateBack(appService);
    return;
  }

  store.loadParticle({
    item,
    imagesData: repositoryState.images,
  });
  render();
  await renderParticleCanvas(deps);
};

// Undo and redo behave like an edit: the page shows the restored particle at
// once and saves it a moment after. An undo back to the saved particle
// leaves nothing to save.
const runParticleHistoryStep = async (deps, direction) => {
  const { render, store } = deps;
  if (!store.selectEditHistoryStep({ direction })) {
    return;
  }
  store.applyEditHistoryStep({ direction });
  queueParticleAutosave(deps);
  render();
  await renderParticleCanvas(deps);
};

export const handleUndoButtonClick = (deps) =>
  runParticleHistoryStep(deps, "undo");

export const handleRedoButtonClick = (deps) =>
  runParticleHistoryStep(deps, "redo");

// Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z redoes, except in a text field or
// a dialog.
export const handleWindowKeyDown = async (deps, payload) => {
  const event = payload._event;
  const direction = resolveEditHistoryShortcut(event);
  if (!direction) {
    return;
  }

  event.preventDefault();
  await runParticleHistoryStep(deps, direction);
};

export const handleBackClick = async (deps) => {
  const { appService } = deps;
  const saved = await saveParticleChanges(deps);
  if (saved) {
    navigateBack(appService);
  }
};

export const handleRightPanelModeChange = async (deps, payload) => {
  const { render, store } = deps;
  const { id } = payload._event.detail;
  store.setRightPanelMode({ mode: id });
  render();
  await renderParticleCanvas(deps);
};

// The form holds only the fields that show, so only the field that changed
// applies, onto the particle as it is: modules and curves the form does not
// show stay as they are.
export const handleParticleFormChange = async (deps, payload) => {
  const { store } = deps;
  const { name, value } = payload._event.detail;
  const { effect, refreshForm } = applyParticleFormChange(
    store.selectEffect(),
    { name, value },
  );
  store.setEffect({ effect });
  // A value the particle keeps differently from how it was typed, such as
  // a width with decimals, shows as it is kept.
  if (refreshForm) {
    store.refreshForm();
  }
  await commitParticleEdit(deps);
};

// A size change restarts the canvas, so width and height show on Submit;
// the other numbers show on the canvas while their slider popover moves.
const SLIDER_FIELDS_WITHOUT_PREVIEW = new Set(["width", "height"]);

export const handleSliderValueInput = (deps, payload) => {
  const { store, subject } = deps;
  const { name } = payload._event.currentTarget.dataset;
  if (SLIDER_FIELDS_WITHOUT_PREVIEW.has(name)) {
    return;
  }

  store.setSliderPreview({ name, value: payload._event.detail.value });
  subject.dispatch(SLIDER_PREVIEW_ACTION, {});
};

// Submit changes the number, as typing it in the form did; closing the
// popover leaves it as it was.
export const handleSliderValueChange = async (deps, payload) => {
  const { store } = deps;
  const { name } = payload._event.currentTarget.dataset;
  const { effect, refreshForm } = applyParticleFormChange(
    store.selectEffect(),
    { name, value: String(payload._event.detail.value) },
  );
  store.clearSliderPreview();
  store.setEffect({ effect });
  if (refreshForm) {
    store.refreshForm();
  }
  await commitParticleEdit(deps);
};

export const handleSliderValueCancel = async (deps) => {
  const { store } = deps;
  store.clearSliderPreview();
  await renderParticleCanvas(deps);
};

// rvn-zoom-viewport keeps the point in view in place when the zoom changes.
export const handleCanvasZoomInClick = async (deps) => {
  const { render, store } = deps;
  store.zoomCanvasIn();
  render();
  await renderParticleCanvas(deps);
};

export const handleCanvasZoomOutClick = async (deps) => {
  const { render, store } = deps;
  store.zoomCanvasOut();
  render();
  await renderParticleCanvas(deps);
};

export const handleCanvasZoomResetClick = async (deps) => {
  const { refs, render, store } = deps;
  store.resetCanvasZoom();
  render();
  refs.canvasBackground.centerContent();
  await renderParticleCanvas(deps);
};

export const handleCanvasZoomGesture = async (deps, payload) => {
  const { render, store } = deps;
  const { zoom } = payload._event.detail;
  store.setCanvasZoom({ zoom });
  render();
  await renderParticleCanvas(deps);
};

const openImageSelector = (deps, slot) => {
  const { render, store } = deps;
  store.closeBackgroundImageMenu();
  store.openImageSelectorDialog({ slot });
  render();
};

export const handleTextureImageClick = (deps) => {
  openImageSelector(deps, "texture");
};

export const handleTextureImageKeyDown = (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  openImageSelector(deps, "texture");
};

export const handleBackgroundImageClick = (deps) => {
  openImageSelector(deps, "background");
};

export const handleBackgroundImageContextMenu = (deps, payload) => {
  const { render, store } = deps;
  const copy = selectCopy(deps);
  const event = payload._event;
  event.preventDefault();
  event.stopPropagation();
  store.openBackgroundImageMenu({
    x: event.clientX,
    y: event.clientY,
    items: [{ label: copy.removeMenuItem, type: "item", value: "remove" }],
  });
  render();
};

export const handleBackgroundImageMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeBackgroundImageMenu();
  render();
};

// A picked or removed preview background saves on its own, as an edit does,
// but is not part of the undo history.
const commitPreviewChange = async (deps) => {
  const { render } = deps;
  queueParticleAutosave(deps);
  render();
  await renderParticleCanvas(deps);
};

export const handleBackgroundImageMenuItemClick = async (deps, payload) => {
  const { render, store } = deps;
  const { item } = payload._event.detail;
  store.closeBackgroundImageMenu();
  if (item.value === "remove") {
    store.clearPreviewBackgroundImage();
    await commitPreviewChange(deps);
    return;
  }
  render();
  await renderParticleCanvas(deps);
};

export const handleImageSelectorImageSelected = async (deps, payload) => {
  const { render, store } = deps;
  const { imageId } = payload._event.detail;
  store.applyImageSelectorSelection({ imageId });
  render();
  await renderParticleCanvas(deps);
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
  await renderParticleCanvas(deps);
};

// A picked texture is one edit; a picked background is only for the
// preview, and saves on its own.
export const handleImageSelectorConfirmClick = async (deps) => {
  const { render, store } = deps;
  const { slot, selectedImageId, originalImageId } =
    store.selectImageSelectorDialog();
  store.closeImageSelectorDialog();
  if (
    slot === "texture" &&
    selectedImageId &&
    selectedImageId !== originalImageId
  ) {
    store.setEffect({
      effect: replaceParticleTextureImage(
        store.selectEffect(),
        selectedImageId,
      ),
    });
    await commitParticleEdit(deps);
    return;
  }
  if (slot === "background") {
    await commitPreviewChange(deps);
    return;
  }

  render();
  await renderParticleCanvas(deps);
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
