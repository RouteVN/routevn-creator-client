import { concatMap, debounceTime, filter, from, map, merge } from "rxjs";
import { getFirstTextStyleId } from "../../constants/textStyles.js";
import { generateId } from "../../internal/id.js";
import { LAYOUT_EDITOR_SCENE_SLOT_ID } from "../../internal/layoutEditorSceneBackdrop.js";
import { applyLayoutElementsCommand } from "../../internal/project/layout.js";
import { captureGraphicsElementThumbnailImage } from "../../internal/runtime/graphicsEngineRuntime.js";
import {
  isTextElementType,
  resolveExplorerMove,
  resolveMenuItem,
} from "../../internal/ui/fileExplorer.js";
import { selectLayoutEditorPageCopy } from "../../internal/ui/layoutEditor/layoutEditorCopy.js";
import { buildLayoutEditPanelUpdatedItem } from "../../internal/ui/layoutEditor/layoutEditorMutations.js";
import {
  promptLayoutEditorNewElements,
  resolvePromptedNewElementAction,
} from "../../internal/ui/layoutEditor/layoutEditorNewElements.js";
import {
  notifyLayoutEditorSaveFailure,
  toLayoutEditorSaveError,
} from "../../internal/ui/layoutEditor/layoutEditorSaveFailure.js";

// Edits change the elements here at once and are saved after a pause, the
// whole layout at a time, one save after another, so a save never meets
// another. Done saves what is left and closes the editor. Cancel saves the
// layout as it was when the editor opened and closes it.
const SAVE_ACTION = "visualLayoutEditor.save";
const DONE_ACTION = "visualLayoutEditor.done";
const CANCEL_ACTION = "visualLayoutEditor.cancel";
const SAVE_DELAY_MS = 400;

const CANVAS_TRANSIENT_DETAIL_FIELDS = [
  "x",
  "y",
  "width",
  "height",
  "rotation",
];

const selectCopy = (i18n = {}) => i18n.visualLayoutEditor ?? {};

const loadFromRepository = (deps) => {
  const { projectService, props, store } = deps;
  store.loadVisualLayout({
    repositoryState: projectService.getRepositoryState(),
    sceneId: props.sceneId,
    sectionId: props.sectionId,
    lineId: props.lineId,
    visualId: props.visualId,
  });
};

const queueSave = ({ subject }) => {
  subject.dispatch(SAVE_ACTION, {});
};

// Saves the elements as they are now, when an edit is not saved yet. A save
// that fails drops the edits not saved, goes back to the saved layout and
// tells the user, with `failureMessage` when given. Once Cancel is pressed,
// only Cancel's own save, marked `isCancel`, is made.
const saveLayoutElements = async (
  deps,
  {
    failureMessage,
    operation = "visualLayoutEditor.save",
    isCancel = false,
  } = {},
) => {
  const { appService, i18n, projectService, props, refs, render, store } = deps;
  if (
    !store.selectHasUnsavedEdits() ||
    (store.selectIsCancelling() && !isCancel)
  ) {
    return { ok: true };
  }

  const copy = selectCopy(i18n);
  const fallbackMessage =
    failureMessage ??
    copy.failedSaveChanges ??
    "Failed to save the layout changes.";
  const elements = store.selectLayoutElements();
  store.markEditsSaved();
  try {
    const result = await projectService.updateVisualLayoutElements({
      lineId: props.lineId,
      visualId: props.visualId,
      elements,
    });
    if (result?.valid === false) {
      throw toLayoutEditorSaveError(result.error, fallbackMessage);
    }
    return { ok: true };
  } catch (failure) {
    loadFromRepository(deps);
    // The canvas keeps an element it was moving until it has its position.
    refs.layoutEditorCanvas?.discardPendingUpdate?.();
    render();
    notifyLayoutEditorSaveFailure({
      appService,
      detailsLabel: i18n.appPage?.errorDetailsLabel,
      error: toLayoutEditorSaveError(failure, fallbackMessage),
      message: fallbackMessage,
      operation,
      title: selectLayoutEditorPageCopy(i18n).errorTitle ?? "Error",
    });
    return { ok: false };
  }
};

// A picture of the layout alone, as the editor draws it in the scene, for
// the visual panel to show at once. The canvas goes when the editor closes.
const captureLayoutSnapshot = async ({ graphicsService, props }) => {
  if (!props.sceneBackdrop) {
    return undefined;
  }
  try {
    return await captureGraphicsElementThumbnailImage(
      graphicsService,
      LAYOUT_EDITOR_SCENE_SLOT_ID,
    );
  } catch (error) {
    // The panel waits for the scene's picture of the visual instead.
    console.warn("[visualLayoutEditor] The layout's picture was not taken", {
      error,
    });
    return undefined;
  }
};

const finishEditing = async (deps) => {
  const { dispatchEvent } = deps;
  const { ok } = await saveLayoutElements(deps);
  if (!ok) {
    return;
  }
  const snapshotUrl = await captureLayoutSnapshot(deps);
  dispatchEvent(new CustomEvent("close", { detail: { snapshotUrl } }));
};

// Cancel puts the layout back as it was when the editor opened and closes
// without a picture: the visual's picture from before is of that layout. An
// edit made while it saves is not saved, also not when the editor closes. If
// the layout cannot be put back, the editor stays open on the saved one.
const cancelEditing = async (deps) => {
  const { dispatchEvent, i18n, projectService, props, refs, render, store } =
    deps;
  store.restoreOpeningLayout({
    repositoryState: projectService.getRepositoryState(),
    sceneId: props.sceneId,
    sectionId: props.sectionId,
    lineId: props.lineId,
    visualId: props.visualId,
  });
  // The canvas keeps an element it was moving until it has its position.
  refs.layoutEditorCanvas?.discardPendingUpdate?.();
  render();
  const { ok } = await saveLayoutElements(deps, {
    failureMessage:
      selectCopy(i18n).failedDiscardChanges ??
      "Your changes to this visual's layout could not be discarded.",
    operation: "visualLayoutEditor.cancel",
    isCancel: true,
  });
  if (!ok) {
    store.stopCancelling();
    return;
  }
  dispatchEvent(new CustomEvent("close", { detail: {} }));
};

const applyElementsCommand = (deps, command) => {
  const { render, store } = deps;
  const elements = applyLayoutElementsCommand(
    store.selectLayoutElements(),
    command,
  );
  if (!elements) {
    return false;
  }

  store.setLayoutElements({ elements });
  render();
  queueSave(deps);
  return true;
};

const updateElement = (deps, { itemId, item }) => {
  const { store } = deps;
  store.updateLayoutElement({ itemId, item });
  queueSave(deps);
};

const selectElement = (deps, itemId) => {
  const { refs, render, store } = deps;
  store.setSelectedItemId({ itemId });
  render();
  if (itemId) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }
};

// Rotating a tablet moves the Elements list between the left pane and the
// panel under the canvas. The one that mounts has no selection of its own, so
// it is pointed at the selected element once it is there.
const selectElementInNewExplorer = (deps) => {
  const { refs, store } = deps;
  const itemId = store.selectSelectedItemId();
  if (!itemId) {
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      refs.fileExplorer?.selectItem?.({ itemId });
    });
  });
};

export const handleBeforeMount = (deps) => {
  const { appService, render, store, subject, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  store.setTouchLandscape({ isTouchLandscape: appService.isTouchLandscape() });
  const unsubscribeTouchLandscape = appService.subscribeTouchLandscape(
    (isTouchLandscape) => {
      if (isTouchLandscape === store.selectIsTouchLandscape()) {
        return;
      }

      store.setTouchLandscape({ isTouchLandscape });
      // Moving the panels rebuilds them, which closes an open popover
      // without a cancel, so its value shown on the canvas goes too.
      store.clearCanvasPreviewItem();
      render();
      selectElementInNewExplorer(deps);
    },
  );

  const saves = merge(
    subject.pipe(
      filter(({ action }) => action === SAVE_ACTION),
      debounceTime(SAVE_DELAY_MS),
      map(() => saveLayoutElements),
    ),
    subject.pipe(
      filter(({ action }) => action === DONE_ACTION),
      map(() => finishEditing),
    ),
    subject.pipe(
      filter(({ action }) => action === CANCEL_ACTION),
      map(() => cancelEditing),
    ),
  )
    .pipe(concatMap((step) => from(step(deps))))
    .subscribe();

  return async () => {
    unsubscribeTouchLandscape();
    saves.unsubscribe();
    await saveLayoutElements(deps);
  };
};

export const handleAfterMount = (deps) => {
  const { render } = deps;
  loadFromRepository(deps);
  render();
};

export const handleDoneClick = ({ subject }) => {
  subject.dispatch(DONE_ACTION, {});
};

export const handleCancelClick = ({ subject }) => {
  subject.dispatch(CANCEL_ACTION, {});
};

export const handleCanvasZoomInClick = (deps) => {
  const { render, store } = deps;
  store.zoomCanvasIn();
  render();
};

export const handleCanvasZoomOutClick = (deps) => {
  const { render, store } = deps;
  store.zoomCanvasOut();
  render();
};

export const handleCanvasZoomResetClick = (deps) => {
  const { refs, render, store } = deps;
  store.resetCanvasZoom();
  render();
  refs.canvasBackground.centerContent();
};

export const handleCanvasZoomGesture = (deps, payload) => {
  const { render, store } = deps;
  const { zoom } = payload._event.detail;
  store.setCanvasZoom({ zoom });
  render();
};

export const handleCanvasBackgroundClick = (deps, payload) => {
  const event = payload._event;
  if (event.target !== event.currentTarget) {
    return;
  }
  selectElement(deps, undefined);
};

export const handleFileExplorerItemClick = (deps, payload) => {
  const { refs, store } = deps;
  const { itemId, source } = payload._event.detail ?? {};
  if (itemId && store.selectSelectedItemId() === itemId) {
    refs.layoutEditorCanvas?.useDefaultSelectionOccurrence?.();
  }
  // On touch an element picked in the list opens in the panel under the
  // canvas. Stepping with the up and down buttons keeps the list open.
  if (itemId && store.selectIsTouchMode() && source !== "navigation") {
    store.closeMobileFileExplorer();
  }
  selectElement(deps, itemId);
};

// Back from an element to the Elements list, with nothing selected, as in
// the layout editor.
export const handleNodeDetailBackClick = (deps) => {
  const { store } = deps;
  store.openMobileFileExplorer();
  selectElement(deps, undefined);
};

export const handleNodeMovePreviousClick = ({ refs }) => {
  refs.fileExplorer.navigateSelection({ direction: "previous", clamp: true });
};

export const handleNodeMoveNextClick = ({ refs }) => {
  refs.fileExplorer.navigateSelection({ direction: "next", clamp: true });
};

// Adds elements asked for in the "new" menu, the first one selected.
const addNewElements = (deps, newElements) => {
  const { store } = deps;
  let elements = store.selectLayoutElements();
  for (const element of newElements) {
    elements = applyLayoutElementsCommand(elements, {
      type: "create",
      elementId: element.elementId,
      data: element.data,
      parentId: element.parentId,
      position: element.position,
    });
  }
  store.setLayoutElements({ elements });
  queueSave(deps);
  selectElement(deps, newElements[0].elementId);
};

export const handleFileExplorerAction = async (deps, payload) => {
  const { appService, i18n, store } = deps;
  const detail = payload._event.detail ?? {};
  const action = resolveMenuItem(detail)?.value;
  const { itemId } = detail;

  if (action === "rename-item-confirmed") {
    if (itemId && detail.newName) {
      applyElementsCommand(deps, {
        type: "update",
        elementId: itemId,
        data: { name: detail.newName },
        replace: false,
      });
    }
    return;
  }

  if (action === "delete-item") {
    if (itemId) {
      applyElementsCommand(deps, { type: "delete", elementIds: [itemId] });
    }
    return;
  }

  if (action?.action !== "new-child-item") {
    return;
  }

  // An element that needs something chosen first, such as a sprite's image.
  const promptedAction = resolvePromptedNewElementAction(action);
  if (promptedAction) {
    const newElements = await promptLayoutEditorNewElements({
      action: promptedAction,
      appService,
      copy: selectLayoutEditorPageCopy(i18n),
      parentId: itemId,
      projectResolution: store.selectProjectResolution(),
      resources: store.selectNewElementResources(),
    });
    if (newElements) {
      addNewElements(deps, newElements);
    }
    return;
  }

  const data = { ...action };
  delete data.action;
  if (isTextElementType(data.type)) {
    const textStyleId = getFirstTextStyleId(store.selectTextStyles());
    if (textStyleId) {
      data.textStyleId = textStyleId;
    }
  }
  addNewElements(deps, [
    { elementId: generateId(), data, parentId: itemId, position: "first" },
  ]);
};

export const handleFileExplorerTargetChanged = (deps, payload) => {
  const move = resolveExplorerMove(payload._event.detail);
  if (!move) {
    return;
  }

  applyElementsCommand(deps, {
    type: "move",
    elementId: move.itemId,
    parentId: move.parentId,
    position: move.repositoryPosition,
    positionTargetId: move.repositoryPositionTargetId,
  });
};

export const handleFileExplorerVisibilityToggle = (deps, payload) => {
  const { itemId, hidden } = payload._event.detail;
  applyElementsCommand(deps, {
    type: "update",
    elementId: itemId,
    data: { hidden },
    replace: false,
  });
};

export const handleCanvasSelectionChange = (deps, payload) => {
  const { itemId } = payload._event.detail;
  selectElement(deps, itemId);
};

export const handleCanvasMetricsChange = (deps, payload) => {
  const { refs, store } = deps;
  const { itemId, metrics } = payload._event.detail;
  if (itemId !== store.selectSelectedItemId()) {
    return;
  }

  store.setSelectedElementMetrics({ metrics });
  refs.layoutEditPanel?.setSelectedElementMetrics?.({ metrics });
};

// A drag moves the element on the canvas, which draws it itself; the panel
// shows the values as they change.
export const handleCanvasDragUpdate = (deps, payload) => {
  const { refs, store } = deps;
  const { itemId, updatedItem } = payload._event.detail;
  const currentItem = store.selectItemById({ itemId });

  const transientValues = {};
  for (const name of CANVAS_TRANSIENT_DETAIL_FIELDS) {
    const value = updatedItem[name];
    if (Number.isFinite(value) && value !== currentItem?.[name]) {
      transientValues[name] = value;
    }
  }
  updateElement(deps, { itemId, item: updatedItem });
  if (Object.keys(transientValues).length > 0) {
    refs.layoutEditPanel?.setTransientValues?.({ values: transientValues });
  }
};

export const handleCanvasUpdate = (deps, payload) => {
  const { render } = deps;
  const { itemId, updatedItem } = payload._event.detail;
  updateElement(deps, { itemId, item: updatedItem });
  render();
};

const buildPanelUpdatedItem = (deps, detail) => {
  const { store } = deps;
  return buildLayoutEditPanelUpdatedItem({
    detail,
    currentItem: store.selectSelectedItem(),
    imagesData: store.selectImages(),
  });
};

export const handleEditPanelUpdate = (deps, payload) => {
  const { render, store } = deps;
  const currentItem = store.selectSelectedItem();
  if (!currentItem) {
    return;
  }

  const item = buildPanelUpdatedItem(deps, payload._event.detail);
  if (JSON.stringify(item) === JSON.stringify(currentItem)) {
    return;
  }

  updateElement(deps, { itemId: store.selectSelectedItemId(), item });
  render();
};

// A popover value shown on the canvas before it is submitted.
export const handleEditPanelPreview = (deps, payload) => {
  const { render, store } = deps;
  if (!store.selectSelectedItem()) {
    return;
  }

  store.setCanvasPreviewItem({
    itemId: store.selectSelectedItemId(),
    item: buildPanelUpdatedItem(deps, payload._event.detail),
  });
  render();
};

export const handleEditPanelPreviewCancel = (deps) => {
  const { render, store } = deps;
  if (!store.selectHasCanvasPreviewItem()) {
    return;
  }

  store.clearCanvasPreviewItem();
  render();
};
