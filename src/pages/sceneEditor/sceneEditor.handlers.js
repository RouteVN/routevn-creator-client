import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import {
  applyPendingDialogueQueueToStore,
  findCharacterIdByShortcut,
  flushDialogueQueue,
  handleMergeLinesOperation,
  handleNewLineOperation,
  handlePasteLinesOperation,
  handleSplitLineOperation,
  handleSwapLineOperation,
  syncSceneEditorProjectState as syncStoreProjectState,
} from "../../internal/ui/sceneEditor/lineOperations.js";
import {
  cloneWithDiagnostics,
  initializeSceneEditorPage,
  mountSceneEditorSubscriptions,
  renderSceneEditorState,
  resetSceneEditorRuntime,
  restoreSceneEditorFromPreview,
  updateSceneEditorSectionChanges,
} from "../../internal/ui/sceneEditor/runtime.js";
import {
  createSceneEditorSectionWithName,
  isSectionsOverviewOpen,
  reconcileSceneEditorSelection,
  selectSceneEditorSection,
} from "../../internal/ui/sceneEditor/sectionOperations.js";

const DEAD_END_TOOLTIP_CONTENT =
  "This section has no transition to another section.";

const getLinesEditorRef = (refs) => {
  return refs?.linesEditor;
};

const focusLinesEditorLine = (refs, payload = {}) => {
  const linesEditorRef = getLinesEditorRef(refs);
  if (!linesEditorRef) {
    return;
  }

  linesEditorRef.focusLine(payload);
};

const scrollLinesEditorLineIntoView = (refs, lineId) => {
  const linesEditorRef = getLinesEditorRef(refs);
  if (!linesEditorRef || !lineId) {
    return;
  }

  linesEditorRef.scrollLineIntoView({ lineId });
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSceneEditorSubscriptions(deps);
  const collabRefreshSubscription = createCollabRemoteRefreshStream({
    deps,
    matches: matchesRemoteTargets([
      "story",
      "layouts",
      "images",
      "colors",
      "fonts",
      "textStyles",
      "characters",
      "variables",
      "sounds",
      "videos",
      "transforms",
      "animations",
    ]),
    refresh: handleDataChanged,
  }).subscribe();

  return async () => {
    collabRefreshSubscription.unsubscribe();
    cleanupSubscriptions();
    await flushDialogueQueue(deps);
    resetSceneEditorRuntime(deps);
  };
};

export const handleAfterMount = async (deps) => {
  await initializeSceneEditorPage({
    ...deps,
    syncProjectState: syncStoreProjectState,
  });
};

export const handleDataChanged = async (deps) => {
  const { store, projectService, render, subject, dialogueQueueService } = deps;
  await projectService.ensureRepository();

  if (store.selectLockingLineId()) {
    return;
  }

  syncStoreProjectState(store, projectService);
  applyPendingDialogueQueueToStore(store, dialogueQueueService);

  reconcileSceneEditorSelection(store);

  await updateSceneEditorSectionChanges(deps);
  render();
  subject.dispatch("sceneEditor.renderCanvas", {
    skipAnimations: true,
  });
};

export const handleSectionTabClick = async (deps, payload) => {
  const { store } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const sectionId =
    payload._event.currentTarget?.dataset?.sectionId ||
    payload._event.currentTarget?.id?.replace("sectionTab", "") ||
    "";
  await selectSceneEditorSection(deps, sectionId);
};

export const handleCommandLineSubmit = async (deps, payload) => {
  const { store, render, projectService, subject, appService } = deps;
  const lineId = store.selectSelectedLineId();

  // Handle section/scene transitions
  if (payload._event.detail.sectionTransition) {
    if (!lineId) {
      console.warn("Section transition requires a selected line");
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (sectionTransition)",
      );
    } catch {
      appService?.showToast("Invalid action payload (non-serializable data)", {
        title: "Error",
      });
      return;
    }

    await projectService.updateLineActions({
      lineId,
      data: safeDetail,
      replace: false,
    });

    syncStoreProjectState(store, projectService);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneEditorState(deps);
    }, 10);
    return;
  }

  // Handle pushLayeredView
  if (payload._event.detail.pushLayeredView) {
    if (!lineId) {
      console.warn("Push layered view requires a selected line");
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (pushLayeredView)",
      );
    } catch {
      appService?.showToast("Invalid action payload (non-serializable data)", {
        title: "Error",
      });
      return;
    }

    await projectService.updateLineActions({
      lineId,
      data: safeDetail,
      replace: false,
    });

    syncStoreProjectState(store, projectService);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneEditorState(deps);
    }, 10);
    return;
  }

  // Handle popLayeredView
  if (payload._event.detail.popLayeredView) {
    if (!lineId) {
      console.warn("Pop layered view requires a selected line");
      return;
    }

    let safeDetail;
    try {
      safeDetail = cloneWithDiagnostics(
        payload._event.detail,
        "command line submit detail (popLayeredView)",
      );
    } catch {
      appService?.showToast("Invalid action payload (non-serializable data)", {
        title: "Error",
      });
      return;
    }

    await projectService.updateLineActions({
      lineId,
      data: safeDetail,
      replace: false,
    });

    syncStoreProjectState(store, projectService);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneEditorState(deps);
    }, 10);
    return;
  }

  if (!lineId) {
    return;
  }

  let submissionData = payload._event.detail;

  // Dialogue updates replace the full dialogue action, so keep content here.
  if (submissionData.dialogue) {
    const line = store.selectSelectedLine();
    if (line && line.actions?.dialogue?.content) {
      submissionData = {
        ...submissionData,
        dialogue: {
          content: line.actions.dialogue.content,
          ...submissionData.dialogue,
        },
      };
    }
  }

  try {
    submissionData = cloneWithDiagnostics(
      submissionData,
      "command line submit detail (general)",
    );
  } catch {
    appService?.showToast("Invalid action payload (non-serializable data)", {
      title: "Error",
    });
    return;
  }

  const { dialogue, ...otherActions } = submissionData;

  if (dialogue) {
    await projectService.updateLineDialogueAction({
      lineId,
      dialogue,
    });
  }

  if (Object.keys(otherActions).length > 0) {
    await projectService.updateLineActions({
      lineId,
      data: otherActions,
      replace: false,
    });
  }

  syncStoreProjectState(store, projectService);
  render();

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleEditorDataChanged = async (deps, payload) => {
  const { subject, store, dialogueQueueService } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const lineId = payload._event.detail.lineId;
  const selectedLineId = store.selectSelectedLineId();
  const lockingLineId = store.selectLockingLineId();

  if (!lineId) {
    return;
  }

  // Ignore late input events from a line that is no longer selected or is in
  // the middle of a structural split/merge operation.
  if (lineId !== selectedLineId || lineId === lockingLineId) {
    return;
  }

  const content = [{ text: payload._event.detail.content }];

  // Update local store immediately for UI responsiveness
  store.setLineTextContent({ lineId, content });

  // Queue the pending update and schedule debounced write
  const sectionId =
    store.selectDomainState()?.lines?.[lineId]?.sectionId ??
    store.selectSelectedSectionId();
  try {
    dialogueQueueService.setAndSchedule(lineId, { sectionId, content });
  } catch (error) {
    console.error("[sceneEditor] Failed to queue dialogue update:", error);
  }

  // Trigger debounced canvas render with skipRender flag.
  // skipRender prevents full UI re-render which would reset cursor position while typing.
  // Typing only updates dialogue content, not presentationState, so State panel doesn't need to update.
  subject.dispatch("sceneEditor.renderCanvas", {
    skipRender: true,
    skipAnimations: true,
  });
};

export const handleDialogueCharacterShortcut = async (deps, payload) => {
  const { store, projectService, render, subject } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const detail = payload?._event?.detail || {};
  const lineId = detail.lineId || store.selectSelectedLineId();
  const shortcut = detail.shortcut;
  if (!lineId || !shortcut) {
    return;
  }

  await flushDialogueQueue(deps);

  const domainState = projectService.getDomainState();
  const existingDialogue =
    domainState?.lines?.[lineId]?.actions?.dialogue || {};

  const isClearShortcut = String(shortcut) === "0";
  if (isClearShortcut && !existingDialogue.characterId) {
    return;
  }

  let characterId;
  if (!isClearShortcut) {
    const repositoryState = projectService.getRepositoryState();
    characterId = findCharacterIdByShortcut(repositoryState, shortcut);
    if (!characterId) {
      return;
    }
  }

  if (!isClearShortcut && existingDialogue.characterId === characterId) {
    return;
  }

  const selectedLine = store.selectSelectedLine();
  const selectedLineContent =
    selectedLine?.id === lineId
      ? selectedLine?.actions?.dialogue?.content
      : undefined;

  const updatedDialogue = {
    ...existingDialogue,
    ...(existingDialogue.content
      ? {}
      : selectedLineContent
        ? { content: selectedLineContent }
        : {}),
  };

  if (isClearShortcut) {
    delete updatedDialogue.characterId;
  } else {
    updatedDialogue.characterId = characterId;
  }

  await projectService.updateLineDialogueAction({
    lineId,
    dialogue: updatedDialogue,
  });

  syncStoreProjectState(store, projectService);
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleAddActionsButtonClick = (deps) => {
  const { refs, render } = deps;
  refs.systemActions?.transformedHandlers?.open?.({
    mode: "actions",
  });
  render();
};

export const handleSectionAddClick = (deps) => {
  const { store, render } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const scene = store.selectScene();
  const sectionCount = scene?.sections?.length || 0;
  const defaultName = `Section ${sectionCount + 1}`;
  store.showSectionCreateDialog({ defaultName });
  render();
};

export const handleSectionsOverviewClick = (deps, payload) => {
  const { store, render, appService } = deps;
  if (payload?._event) {
    payload._event.preventDefault();
  }

  appService.blurActiveElement();

  store.hideDeadEndTooltip();
  store.openSectionsOverviewPanel();
  render();
};

export const handleSectionsOverviewClose = (deps) => {
  const { store, render } = deps;
  store.hideDeadEndTooltip();
  store.closeSectionsOverviewPanel();
  render();
};

export const handleSectionsOverviewWarningMouseEnter = (deps, payload) => {
  const { store, render } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();

  store.showDeadEndTooltip({
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
    content: DEAD_END_TOOLTIP_CONTENT,
  });
  render();
};

export const handleSectionsOverviewWarningMouseLeave = (deps) => {
  const { store, render } = deps;
  store.hideDeadEndTooltip();
  render();
};

export const handleSectionsOverviewRowClick = async (deps, payload) => {
  const { store } = deps;
  const sectionId =
    payload._event.currentTarget?.dataset?.sectionId ||
    payload._event.currentTarget?.id?.replace("sectionOverviewRow", "") ||
    "";

  if (!sectionId) {
    return;
  }

  store.closeSectionsOverviewPanel();
  await selectSceneEditorSection(deps, sectionId);
};

export const handleSplitLine = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  await handleSplitLineOperation(deps, payload);
};

export const handlePasteLines = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  await handlePasteLinesOperation(deps, payload);
};

export const handleNewLine = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  await handleNewLineOperation(deps, payload);
};

export const handleLineNavigation = (deps, payload) => {
  const { store, refs, render, subject, graphicsService } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const { targetLineId, mode, direction, targetCursorPosition } =
    payload._event.detail;

  // For block mode, just update the selection and handle scrolling
  if (mode === "block") {
    const currentLineId = store.selectSelectedLineId();

    // Check if we're trying to move up from the first line
    if (direction === "up" && currentLineId === targetLineId) {
      // First line - show animation effects
      graphicsService.render({
        elements: [],
        animations: [],
      });
      subject.dispatch("sceneEditor.renderCanvas", {});
      return;
    }

    store.setSelectedLineId({ selectedLineId: targetLineId });
    render();

    if (targetLineId) {
      requestAnimationFrame(() => {
        scrollLinesEditorLineIntoView(refs, targetLineId);
      });
    }

    // Trigger debounced canvas render
    subject.dispatch("sceneEditor.renderCanvas", {});
    return;
  }

  // For text-editor mode, handle cursor navigation
  const currentLineId = store.selectSelectedLineId();
  let nextLineId = targetLineId;

  // Determine next line based on direction if targetLineId is current line
  if (targetLineId === currentLineId) {
    if (direction === "up" || direction === "end") {
      nextLineId = store.selectPreviousLineId({ lineId: currentLineId });
    } else if (direction === "down") {
      nextLineId = store.selectNextLineId({ lineId: currentLineId });
    }
  }

  // Handle navigation to different line
  if (nextLineId && nextLineId !== currentLineId) {
    const linesEditorRef = getLinesEditorRef(refs);

    // Update selectedLineId through the store
    store.setSelectedLineId({ selectedLineId: nextLineId });
    render();

    requestAnimationFrame(() => {
      if (linesEditorRef) {
        const isEndNavigation = targetCursorPosition === -1;
        focusLinesEditorLine(refs, {
          lineId: nextLineId,
          cursorPosition: isEndNavigation
            ? Number.MAX_SAFE_INTEGER
            : targetCursorPosition,
          goalColumn: isEndNavigation
            ? Number.MAX_SAFE_INTEGER
            : targetCursorPosition,
          direction: direction ?? undefined,
        });
      }

      // Trigger debounced canvas render
      subject.dispatch("sceneEditor.renderCanvas", {});
    });
  } else if (direction === "up" && currentLineId === targetLineId) {
    // First line - show animation effects
    graphicsService.render({
      elements: [],
      animations: [],
    });
    render();
    subject.dispatch("sceneEditor.renderCanvas", {});
  }
};

export const handleSwapLine = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  await handleSwapLineOperation(deps, payload);
};

export const handleMergeLines = async (deps, payload) => {
  if (isSectionsOverviewOpen(deps.store)) {
    return;
  }
  await handleMergeLinesOperation(deps, payload);
};

export const handleSectionTabRightClick = (deps, payload) => {
  const { store, render } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  payload._event.preventDefault(); // Prevent default browser context menu

  const sectionId =
    payload._event.currentTarget?.dataset?.sectionId ||
    payload._event.currentTarget?.id?.replace("sectionTab", "") ||
    "";

  store.showSectionDropdownMenu({
    position: {
      x: payload._event.clientX,
      y: payload._event.clientY,
    },
    sectionId,
  });

  render();
};

export const handleActionsDialogClose = (deps) => {
  const { render } = deps;
  render();
};

export const handleDropdownMenuClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, projectService, subject } = deps;
  const item = payload._event.detail.item || payload._event.detail;
  const action = item?.value;
  const dropdownState = store.getState().dropdownMenu;
  const sectionId = dropdownState.sectionId;
  const actionsType = dropdownState.actionsType;
  const sceneId = store.selectSceneId();

  // Store position before hiding dropdown (for rename popover)
  const position = dropdownState.position;

  store.hideDropdownMenu();

  if (typeof action === "string" && action.startsWith("go-to-section:")) {
    const nextSectionId = action.replace("go-to-section:", "");
    if (nextSectionId) {
      await selectSceneEditorSection(deps, nextSectionId);
      return;
    }
  }

  if (action === "delete-section") {
    await projectService.deleteSectionItem({
      sceneId,
      sectionIds: [sectionId],
    });

    // Update store with new repository state
    syncStoreProjectState(store, projectService);

    // Update scene data and select first remaining section
    const newScene = store.selectScene();
    if (newScene && newScene.sections.length > 0) {
      store.setSelectedSectionId({
        selectedSectionId: newScene.sections[0].id,
      });
    }
  } else if (action === "rename-section") {
    // Show rename popover using the stored position
    store.showPopover({
      position,
      sectionId,
      mode: "rename-section",
      defaultName: "",
    });
  } else if (action === "delete-actions") {
    const selectedLineId = store.selectSelectedLineId();
    const selectedSectionId = store.selectSelectedSectionId();

    if (actionsType && selectedLineId && selectedSectionId) {
      // Special handling for dialogue - keep content, remove only layoutId and characterId
      if (actionsType === "dialogue") {
        const stateBefore = projectService.getRepositoryState();
        const currentActions =
          stateBefore.scenes?.items?.[sceneId]?.sections?.items?.[
            selectedSectionId
          ]?.lines?.items?.[selectedLineId]?.actions;

        if (currentActions?.dialogue) {
          // Keep content if it exists, remove layoutId and characterId
          const updatedDialogue = {
            content: currentActions.dialogue.content,
          };

          await projectService.updateLineDialogueAction({
            lineId: selectedLineId,
            dialogue: updatedDialogue,
          });
        }
      } else {
        const stateBefore = projectService.getRepositoryState();
        const currentActions =
          stateBefore.scenes?.items?.[sceneId]?.sections?.items?.[
            selectedSectionId
          ]?.lines?.items?.[selectedLineId]?.actions || {};
        const nextActions = structuredClone(currentActions);
        delete nextActions[actionsType];

        await projectService.updateLineActions({
          lineId: selectedLineId,
          data: nextActions,
          replace: true,
        });
      }

      syncStoreProjectState(store, projectService);

      // Trigger re-render to update the view
      subject.dispatch("sceneEditor.renderCanvas", {});
    }
  }

  render();
};

export const handlePopoverClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleSectionCreateDialogClose = (deps) => {
  const { store, render } = deps;
  store.hideSectionCreateDialog();
  render();
};

export const handleSectionCreateFormActionClick = async (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const action = detail.actionId;
  const values = detail.values || {};
  const nextSectionName = String(values.name || "").trim();

  if (action === "cancel") {
    store.hideSectionCreateDialog();
    render();
    return;
  }

  if (action === "submit") {
    store.hideSectionCreateDialog();
    if (nextSectionName) {
      await createSceneEditorSectionWithName(
        deps,
        nextSectionName,
        syncStoreProjectState,
      );
      return;
    }
  }

  render();
};

export const handleFormActionClick = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const detail = payload._event.detail;

  const action = detail.actionId;
  const values = detail.values;

  if (action === "cancel") {
    store.hidePopover();
    render();
    return;
  }

  if (action === "submit") {
    const popoverState = store.getState().popover || {};
    const sectionId = popoverState.sectionId;
    const popoverMode = popoverState.mode;
    const sceneId = store.selectSceneId();
    const nextSectionName = String(values?.name || "").trim();

    // Hide popover
    store.hidePopover();

    if (popoverMode === "create-section" && nextSectionName && sceneId) {
      await createSceneEditorSectionWithName(
        deps,
        nextSectionName,
        syncStoreProjectState,
      );
      return;
    }

    if (sectionId && nextSectionName && sceneId) {
      await projectService.renameSectionItem({
        sceneId,
        sectionId,
        name: nextSectionName,
      });

      // Update store with new repository state
      syncStoreProjectState(store, projectService);
    }

    render();
  }
};

export const handleToggleSectionsGraphView = (deps) => {
  const { store, render } = deps;
  store.toggleSectionsGraphView();
  render();
};

export const handlePreviewClick = (deps) => {
  const { store, render, appService } = deps;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  appService.blurActiveElement();
  store.showPreviewSceneId({ sceneId, sectionId, lineId });
  render();
};

export const handlePreviewShortcut = (deps) => {
  handlePreviewClick(deps);
};

export const handleDeleteLineShortcut = async (deps, payload) => {
  const { store, subject, render, projectService, globalUI, appService } = deps;
  if (isSectionsOverviewOpen(store)) {
    return;
  }

  const detail = payload?._event?.detail || {};
  const lineId =
    typeof detail.lineId === "string" && detail.lineId
      ? detail.lineId
      : store.selectSelectedLineId();
  const sectionId = store.selectSelectedSectionId();

  if (!lineId || !sectionId) {
    return;
  }

  const scene = store.selectScene();
  const section = scene?.sections?.find((item) => item.id === sectionId);
  const lines = Array.isArray(section?.lines) ? section.lines : [];
  const currentIndex = lines.findIndex((line) => line.id === lineId);
  if (currentIndex < 0) {
    return;
  }

  const dialogOptions = {
    title: "Delete Line",
    message: "Are you sure you want to delete this line?",
    confirmText: "Delete",
  };

  let confirmationResult = false;
  if (typeof globalUI?.showConfirm === "function") {
    confirmationResult = await globalUI.showConfirm(dialogOptions);
  } else if (typeof appService?.showDialog === "function") {
    confirmationResult = await appService.showDialog(dialogOptions);
  }

  const confirmed =
    typeof confirmationResult === "boolean"
      ? confirmationResult
      : !!(confirmationResult?.confirmed ?? confirmationResult?.value);
  if (!confirmed) {
    return;
  }

  const nextSelectedLineId =
    lines[currentIndex + 1]?.id || lines[currentIndex - 1]?.id;

  await flushDialogueQueue(deps);
  await projectService.deleteLineItem({ lineIds: [lineId] });

  syncStoreProjectState(store, projectService);
  store.setSelectedLineId({ selectedLineId: nextSelectedLineId });

  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleLineDeleteActionItem = async (deps, payload) => {
  const { store, subject, render, projectService } = deps;
  const { actionType } = payload._event.detail;
  // Get current selected line
  const selectedLine = store.selectSelectedLine();
  if (!selectedLine || !selectedLine.actions) {
    return;
  }
  // Create a new actions object without the action to delete
  const newActions = { ...selectedLine.actions };
  if (newActions.hasOwnProperty(actionType)) {
    if (actionType === "dialogue") {
      newActions[actionType] = {
        content: newActions[actionType].content,
      };
    } else {
      delete newActions[actionType];
    }
  }
  await projectService.updateLineActions({
    lineId: selectedLine.id,
    data: newActions,
    replace: true,
  });
  // Update store with new repository state
  syncStoreProjectState(store, projectService);
  // Trigger re-render
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleHidePreviewScene = async (deps) => {
  await restoreSceneEditorFromPreview(deps);
};

export const handleBackClick = (deps) => {
  const { appService } = deps;
  const { p } = appService.getPayload();
  appService.navigate("/project/scenes", { p });
};

export const handleSystemActionsActionDelete = async (deps, payload) => {
  const { store, render, projectService, subject } = deps;
  const { actionType } = payload._event.detail;
  // Get current selected line
  const selectedLine = store.selectSelectedLine();
  if (!selectedLine) {
    return;
  }
  // Create a new actions object with the action cleared
  // For inherited actions (visual, character, background), we set a "clear" value
  // to override inherited state. For non-inherited actions, we delete the key.
  const newActions = structuredClone(selectedLine.actions || {});
  if (actionType === "dialogue") {
    newActions.dialogue = { clear: true };
  } else if (actionType === "visual") {
    // Clear visual by setting empty items array
    newActions.visual = { items: [] };
  } else if (actionType === "character") {
    // Clear characters by setting empty items array
    newActions.character = { items: [] };
  } else if (actionType === "background") {
    // Clear background by setting without resourceId
    newActions.background = {};
  } else if (actionType === "control") {
    newActions.control = {};
  } else {
    // For non-inherited actions, delete as before
    delete newActions[actionType];
  }
  await projectService.updateLineActions({
    lineId: selectedLine.id,
    data: newActions,
    replace: true,
  });
  // Update store with new repository state
  syncStoreProjectState(store, projectService);
  // Trigger re-render
  render();

  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleMuteToggle = (deps) => {
  const { store, render, subject } = deps;
  store.toggleMute();
  render();
  // Re-render canvas with new mute state
  subject.dispatch("sceneEditor.renderCanvas", {});
};
