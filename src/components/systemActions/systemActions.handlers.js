import { normalizeLineActions } from "../../internal/project/engineActions.js";
import {
  createActionItemWithInlineTransform,
  createBackgroundWithInlineTransform,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";
import { getRoutevnCreatorSystemActionDocsUrl } from "../../internal/routevnUrls.js";

const toPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const normalizeActionsObject = (value) => {
  return normalizeLineActions(toPlainObject(value));
};

const syncActions = (store, value) => {
  const actions = toPlainObject(value);
  store.setAuthoredDialogueWasCleared({
    authoredDialogueWasCleared: actions.dialogue?.clear === true,
  });
  store.updateActions(normalizeActionsObject(actions));
};

const mergeActions = (currentActions, nextPartialActions) => {
  return {
    ...toPlainObject(currentActions),
    ...toPlainObject(nextPartialActions),
  };
};

const dispatchTemporaryPresentationStateChange = (
  { dispatchEvent },
  presentationState = {},
) => {
  dispatchEvent(
    new CustomEvent("temporary-presentation-state-change", {
      detail: {
        presentationState,
      },
    }),
  );
};

const dispatchActionsDialogOpen = ({ dispatchEvent, props }, mode) => {
  dispatchEvent(
    new CustomEvent("actions-dialog-open", {
      detail: {
        mode,
        selectedLineId: props.selectedLineId,
      },
    }),
  );
};

const syncRepositoryState = (deps) => {
  const { store, projectService } = deps;
  store.setRepositoryState({
    repositoryState: projectService.getRepositoryState(),
  });
};

export const open = (deps, payload) => {
  const { store, render } = deps;
  const { mode, actions } = payload;
  const nextActions = actions !== undefined ? actions : deps.props?.actions;

  syncActions(store, nextActions);
  store.showActionsDialog();
  store.setMode({ mode });
  render();
};

export const handleAfterMount = async (deps) => {
  const { render } = deps;
  await syncRepositoryState(deps);
  render();
};

export const handleBeforeMount = (deps) => {
  const { props, render, store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  syncActions(store, props.actions);
  store.setRepositoryState({
    repositoryState: deps.projectService.getRepositoryState(),
  });
  render();
};

export const handleOnUpdate = (deps, changes) => {
  const { render, store } = deps;
  const { newProps } = changes;
  syncRepositoryState(deps);
  syncActions(store, newProps.actions);

  if (
    !isBooleanPropEnabled(newProps?.suppressDialogClose) &&
    newProps?.backgroundTransformEditor?.suppressActionsDialogClose !== true
  ) {
    store.setSuppressDialogClose?.({ suppressDialogClose: false });
  }

  render();
};

export const handleBackToActions = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render } = deps;
  dispatchTemporaryPresentationStateChange(deps, {});
  store.setMode({ mode: "actions" });
  render();
};

export const handleActionClicked = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render } = deps;

  store.setMode({
    mode: payload._event.detail.item.mode,
  });

  render();
};

export const handleTemporaryPresentationStateChange = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const presentationState = toPlainObject(
    payload?._event?.detail?.presentationState,
  );
  dispatchTemporaryPresentationStateChange(deps, presentationState);
};

export const handleBackgroundTransformCustomize = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { refs, store } = deps;

  store?.setSuppressDialogClose?.({ suppressDialogClose: true });
  refs?.actionsDialog?.transformedHandlers?.handleSuppressClose?.();

  deps.dispatchEvent(
    new CustomEvent("background-transform-customize", {
      detail: toPlainObject(payload?._event?.detail),
    }),
  );
};

export const handleBackgroundTransformEditorDone = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  deps.dispatchEvent(
    new CustomEvent("background-transform-editor-done", {
      detail: toPlainObject(payload?._event?.detail),
    }),
  );
};

export const handleActionTransformCustomize = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { refs, store } = deps;

  store?.setSuppressDialogClose?.({ suppressDialogClose: true });
  refs?.actionsDialog?.transformedHandlers?.handleSuppressClose?.();

  deps.dispatchEvent(
    new CustomEvent("action-transform-customize", {
      detail: toPlainObject(payload?._event?.detail),
    }),
  );
};

export const handleActionTransformEditorDone = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  deps.dispatchEvent(
    new CustomEvent("action-transform-editor-done", {
      detail: toPlainObject(payload?._event?.detail),
    }),
  );
};

const closeEmbeddedTransformEditors = (refs = {}) => {
  refs?.commandLineBackground?.transformedHandlers?.handleCancelCustomTransformEditor?.();
  refs?.commandLineCharacters?.transformedHandlers?.handleCancelCustomTransformEditor?.();
  refs?.commandLineVisual?.transformedHandlers?.handleCancelCustomTransformEditor?.();
};

export const handleActionsDialogCloseRequest = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const { props, refs, store } = deps;
  if (props?.backgroundTransformEditor?.isOpen !== true) {
    return;
  }

  store?.setSuppressDialogClose?.({ suppressDialogClose: true });
  closeEmbeddedTransformEditors(refs);
  deps.dispatchEvent(
    new CustomEvent("background-transform-editor-cancel", {
      detail: {},
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleGetBackgroundTransformPreviewCanvasRoot = ({ refs }) => {
  return (
    refs?.commandLineBackground?.transformedHandlers?.handleGetBackgroundTransformPreviewCanvasRoot?.() ||
    refs?.commandLineVisual?.transformedHandlers?.handleGetBackgroundTransformPreviewCanvasRoot?.() ||
    refs?.commandLineCharacters?.transformedHandlers?.handleGetBackgroundTransformPreviewCanvasRoot?.()
  );
};

export const handleSetBackgroundCustomTransform = (
  deps,
  { background, transform } = {},
) => {
  const { refs, store } = deps;
  const nextBackground = createBackgroundWithInlineTransform(
    background ?? store.selectAction().background,
    transform,
  );

  refs?.commandLineBackground?.transformedHandlers?.handleSetCustomTransform?.({
    transform: nextBackground,
  });
  dispatchTemporaryPresentationStateChange(deps, {
    background: nextBackground,
  });
};

const resolveActionTransformIndex = (items = [], { itemIndex, item } = {}) => {
  if (Number.isInteger(itemIndex)) {
    return itemIndex;
  }

  if (item?.id) {
    return items.findIndex((candidate) => candidate?.id === item.id);
  }

  return -1;
};

export const handleSetActionCustomTransform = (
  deps,
  { targetType, itemIndex, item, transform, action: actionSnapshot } = {},
) => {
  const { refs, store } = deps;
  const actionKey = targetType === "character" ? "character" : "visual";
  const action = toPlainObject(
    actionSnapshot ?? store.selectAction()?.[actionKey],
  );
  const items = Array.isArray(action.items) ? [...action.items] : [];
  const resolvedIndex = resolveActionTransformIndex(items, { itemIndex, item });
  const sourceItem = item ?? items[resolvedIndex];

  if (!sourceItem || resolvedIndex < 0) {
    return;
  }

  const nextItem = createActionItemWithInlineTransform(sourceItem, transform, {
    preserveTransformId: true,
  });
  items[resolvedIndex] = nextItem;

  if (actionKey === "character") {
    refs?.commandLineCharacters?.transformedHandlers?.handleSetCustomTransform?.(
      {
        index: resolvedIndex,
        transform,
      },
    );
  } else {
    refs?.commandLineVisual?.transformedHandlers?.handleSetCustomTransform?.({
      index: resolvedIndex,
      transform,
    });
  }

  dispatchTemporaryPresentationStateChange(deps, {
    [actionKey]: {
      ...action,
      items,
    },
  });
};

export const handleCommandLineSubmit = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render, dispatchEvent } = deps;
  const submittedActions = payload?._event?.detail || {};
  const nextActions = normalizeActionsObject(
    mergeActions(store.selectAction(), submittedActions),
  );

  if (Object.hasOwn(submittedActions, "dialogue")) {
    store.setAuthoredDialogueWasCleared({
      authoredDialogueWasCleared: submittedActions.dialogue?.clear === true,
    });
  }
  store.updateActions(nextActions);
  dispatchEvent(
    new CustomEvent("actions-change", {
      detail: normalizeActionsObject(submittedActions),
    }),
  );
  store.hideActionsDialog();
  render();
};

export const handleAddActionButtonClicked = (deps) => {
  const { store, render } = deps;
  dispatchActionsDialogOpen(deps, "actions");
  store.showActionsDialog();
  store.setMode({ mode: "actions" });
  render();
};

export const handleActionControlMouseDown = (_deps, payload) => {
  const event = payload?._event;
  if (event?.button === undefined || event.button === 0) {
    event.preventDefault?.();
  }
};

export const handleEmbeddedCloseClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  dispatchTemporaryPresentationStateChange(deps, {});
  deps.dispatchEvent(new CustomEvent("close"));
};

export const handleHelpFloatingButtonClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { appService, store } = deps;
  const mode = store.selectMode();

  appService.openUrl(getRoutevnCreatorSystemActionDocsUrl(mode));
};

export const handleVoicePreviewClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  const { appService, i18n, store, render } = deps;
  const copy = selectCommandLineCopy(i18n);
  const voicePreview = store.selectVoicePreview();

  if (!voicePreview?.fileId) {
    appService.showAlert({
      message: localizeCommandLineText(
        "Voice preview audio is unavailable.",
        copy,
      ),
      title: localizeCommandLineText("Warning", copy),
    });
    return;
  }

  store.openAudioPlayer({
    fileId: voicePreview.fileId,
    fileName: voicePreview.name,
  });
  render();
};

export const handleAudioPlayerClose = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  const { store, render } = deps;
  store.closeAudioPlayer();
  render();
};

const isBooleanPropEnabled = (value) => {
  return value === true || value === "true";
};

export const handleActionsDialogClose = (deps, payload) => {
  const { props, store, render, dispatchEvent } = deps;
  const suppressByProps = isBooleanPropEnabled(props?.suppressDialogClose);
  const suppressByStore = store.selectSuppressDialogClose?.() === true;
  if (suppressByProps || suppressByStore) {
    payload?._event?.preventDefault?.();
    payload?._event?.stopPropagation?.();
    return;
  }
  dispatchTemporaryPresentationStateChange(deps, {});
  store.hideActionsDialog();
  render();
  dispatchEvent(new CustomEvent("close"));
  store.setMode({ mode: "actions" });
};

export const handleActionItemClick = (deps, payload) => {
  const { store, render } = deps;
  const event = payload._event;
  const mode = event.currentTarget?.dataset?.mode;
  dispatchActionsDialogOpen(deps, mode);
  store.showActionsDialog();
  store.setMode({ mode });
  render();
};

export const handleActionItemRightClick = (deps, payload) => {
  const { store, render } = deps;
  const event = payload._event;
  event.preventDefault();
  store.showDropdownMenu({
    position: { x: event.clientX, y: event.clientY },
    actionType: event.currentTarget?.dataset?.mode,
  });
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const { detail } = payload._event;

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;
  const actionType = store.selectDropdownMenuActionType();

  store.hideDropdownMenu();

  if (item.value === "delete" && actionType) {
    // Dispatch delete action event to parent component
    dispatchEvent(
      new CustomEvent("action-delete", {
        detail: { actionType },
      }),
    );
  }
  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};
