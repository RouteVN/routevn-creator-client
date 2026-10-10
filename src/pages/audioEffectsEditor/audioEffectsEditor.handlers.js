import {
  createAudioEffectsEditorPayload,
  getAudioEffectsEditorBackPath,
  resolveAudioEffectsEditorPayload,
} from "../../internal/audioEffectsEditorRoute.js";
import { resolveEditHistoryShortcut } from "../../internal/ui/editHistory.js";
import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { AUDIO_EFFECT_PROPERTY_CONFIG } from "./audioEffectsEditor.constants.js";
import {
  playAudioEffectPreview,
  stopAudioEffectPreview,
} from "./support/audioEffectPreviewRuntime.js";
import { selectAudioEffectsEditorPageCopy } from "./support/audioEffectsEditorPageCopy.js";
import { buildAudioEffectKeyframe } from "./support/audioEffectsEditorValidation.js";

const TIMELINE_ZOOM_STEP = 0.125;

const selectCopy = ({ i18n } = {}) => selectAudioEffectsEditorPageCopy(i18n);

const navigateBack = (appService) => {
  appService.navigate(
    getAudioEffectsEditorBackPath(),
    createAudioEffectsEditorPayload({
      payload: appService.getPayload() ?? {},
    }),
    { historyMode: "replace" },
  );
};

// Saves the audio effect and its preview sounds, whichever differ from what
// is saved, in one update.
const persistAudioEffect = async (deps, { notify = false } = {}) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const audioEffectId = store.selectAudioEffectId();
  if (!audioEffectId) {
    return true;
  }

  const dirty = store.selectDirty();
  const preview = store.selectUnsavedPreviewData();
  if (!dirty && !preview) {
    return true;
  }

  const audioEffect = store.selectAudioEffectDefinition();
  const data = {};
  if (dirty) {
    data.audioEffect = audioEffect;
  }
  if (preview) {
    data.preview = preview;
  }
  store.setSaving({ saving: true });
  render();
  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedSaveAudioEffect ?? "Failed to save audio effect.",
    action: () =>
      projectService.updateAudioEffect({
        audioEffectId,
        data,
      }),
  });
  store.setSaving({ saving: false });
  if (updateAttempt.ok) {
    if (dirty) {
      store.markSaved({ definition: audioEffect });
    }
    if (preview) {
      store.markPreviewSaved({ preview });
    }
    if (notify) {
      appService.showToast({
        message: copy.audioEffectSaved ?? "Audio effect saved.",
      });
    }
  }
  render();
  return updateAttempt.ok;
};

export const handleBeforeMount = (deps) => {
  const {
    appService,
    browserEventsClient,
    render,
    store,
    uiConfig,
    windowMetricsClient,
  } = deps;
  store.setUiConfig({ uiConfig });
  // Phones and tablets place the tabs and the navbar's buttons differently.
  const cleanupWindowLayout = mountMobileResourceWindowLayout({
    windowMetricsClient,
    store,
    render,
  });
  const cleanupWindowResize = browserEventsClient.subscribeWindowEvent({
    type: "resize",
    listener: () => handleTimelineViewportResize(deps),
  });
  const cleanupHistoryShortcuts = browserEventsClient.subscribeWindowEvent({
    type: "keydown",
    options: { capture: true },
    listener: (event) =>
      handleEditHistoryShortcutKeyDown(deps, { _event: event }),
  });
  const unregisterBeforeNavigation = appService.registerBeforeNavigation(
    async () => {
      const saved = await persistAudioEffect(deps);
      if (!saved) {
        throw new Error("Failed to save audio effect before navigation.");
      }
    },
  );

  return async () => {
    unregisterBeforeNavigation();
    cleanupWindowLayout?.();
    cleanupWindowResize();
    cleanupHistoryShortcuts();
    await stopAudioEffectPreview(deps);
    const saved = await persistAudioEffect(deps);
    if (!saved) {
      throw new Error("Failed to save audio effect during cleanup.");
    }
  };
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  await projectService.ensureRepository();
  const { audioEffectId } = resolveAudioEffectsEditorPayload(
    appService.getPayload() ?? {},
  );
  const repositoryState = projectService.getRepositoryState();
  const item = repositoryState?.audioEffects?.items?.[audioEffectId];
  if (!item || item.type !== "audioEffect") {
    appService.showAlert({
      title: copy.errorTitle ?? "Error",
      message: copy.audioEffectNotFound ?? "Audio effect not found.",
    });
    navigateBack(appService);
    return;
  }

  store.setSoundsData({
    soundsData: repositoryState.sounds ?? { items: {}, tree: [] },
  });
  store.loadAudioEffect({ item });
  render();
  handleTimelineViewportResize(deps);
};

// Every edit to the audio effect ends here, so this is where it enters the
// undo history.
const commitAudioEffectEdit = (deps) => {
  const { render, store } = deps;
  store.recordAudioEffectEdit({
    definition: store.selectAudioEffectDefinition(),
    time: Date.now(),
  });
  render();
};

// Undo and redo behave like an edit: the page shows the restored audio
// effect at once and saves it with its other edits when it leaves. An undo
// back to the saved audio effect leaves nothing to save.
const runAudioEffectHistoryStep = (deps, direction) => {
  const { render, store } = deps;
  if (!store.selectEditHistoryStep({ direction })) {
    return;
  }
  store.applyEditHistoryStep({ direction });
  render();
};

export const handleUndoButtonClick = (deps) =>
  runAudioEffectHistoryStep(deps, "undo");

export const handleRedoButtonClick = (deps) =>
  runAudioEffectHistoryStep(deps, "redo");

export const handleEditHistoryShortcutKeyDown = (deps, payload) => {
  const event = payload._event;
  const direction = resolveEditHistoryShortcut(event);
  if (!direction) {
    return;
  }
  event.preventDefault();
  runAudioEffectHistoryStep(deps, direction);
};

export const handleBackClick = async (deps) => {
  const { appService } = deps;
  const saved = await persistAudioEffect(deps);
  if (saved) {
    navigateBack(appService);
  }
};

const activateEditorTab = async (deps, tab) => {
  const { render, store } = deps;
  if (tab === store.selectSelectedEditorTab()) {
    return;
  }
  if (tab !== "preview" && store.selectPreviewPlaying()) {
    await stopAudioEffectPreview(deps);
  }
  store.setSelectedEditorTab({ tab });
  render();
  if (tab === "timeline") {
    handleTimelineViewportResize(deps);
  }
};

// rtgl-tabs moves focus with the arrow keys, and picks a tab on a click,
// Enter, or Space.
export const handleEditorTabClick = async (deps, payload) => {
  await activateEditorTab(deps, payload._event.detail.id);
};

export const handleTimelineZoomChange = (deps, payload) => {
  const { render, store } = deps;
  store.setTimelineZoom({ zoom: resolveValueChange(payload) });
  render();
};

export const handleTimelineZoomButtonClick = (deps, payload) => {
  const { refs, render, store } = deps;
  payload._event.stopPropagation();
  const rect = refs.timelineZoomButton.getBoundingClientRect();
  store.openTimelineZoomPopover({ x: rect.right, y: rect.bottom });
  render();
};

export const handleTimelineZoomPopoverClose = (deps) => {
  const { render, store } = deps;
  store.closeTimelineZoomPopover();
  render();
};

export const handleTimelineZoomOut = (deps) => {
  const { render, store } = deps;
  store.nudgeTimelineZoom({ delta: -TIMELINE_ZOOM_STEP });
  render();
};

export const handleTimelineZoomIn = (deps) => {
  const { render, store } = deps;
  store.nudgeTimelineZoom({ delta: TIMELINE_ZOOM_STEP });
  render();
};

export const handleTimelineScroll = (deps, payload) => {
  const { store } = deps;
  const timelineViewport = payload._event.currentTarget;
  if (timelineViewport.clientWidth !== store.selectTimelineViewportWidth()) {
    store.setTimelineViewportWidth({
      viewportWidth: timelineViewport.clientWidth,
    });
  }
};

export const handleTimelineViewportResize = (deps) => {
  const { refs, render, store } = deps;
  const timelineViewport = refs.timelineScrollContainer;
  if (
    !timelineViewport ||
    timelineViewport.clientWidth === store.selectTimelineViewportWidth()
  ) {
    return;
  }

  store.setTimelineViewportWidth({
    viewportWidth: timelineViewport.clientWidth,
  });
  render();
};

export const handlePlayClick = async (deps) => {
  const { appService, render, store } = deps;
  if (store.selectPreviewPlaying()) {
    await stopAudioEffectPreview(deps);
    render();
    return;
  }

  try {
    await playAudioEffectPreview(deps);
  } catch (error) {
    console.error(
      "[audioEffectsEditor] Failed to preview audio effect.",
      error,
    );
    appService.showToast({
      message:
        selectCopy(deps).failedPreviewAudioEffect ??
        "Failed to preview audio effect.",
    });
  }
};

export const handlePlayButtonTooltipShow = (deps, payload) => {
  const { render, store } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.showPlayButtonTooltip({
    x: rect.left + rect.width / 2,
    y: rect.bottom + 8,
  });
  render();
};

export const handlePlayButtonTooltipHide = (deps) => {
  const { render, store } = deps;
  store.hidePlayButtonTooltip();
  render();
};

export const handleTogglePreviewLoop = (deps) => {
  const { render, store } = deps;
  store.togglePreviewLoop({});
  render();
};

export const handlePreviewSoundClick = async (deps, payload) => {
  const { render, store } = deps;
  if (store.selectPreviewPlaying()) {
    await stopAudioEffectPreview(deps);
  }
  store.openPreviewSoundSelector({
    target: payload._event.currentTarget.dataset.target,
  });
  render();
};

export const handlePreviewSoundKeyDown = async (deps, payload) => {
  const event = payload._event;
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  await handlePreviewSoundClick(deps, payload);
};

export const handleSoundSelectorDialogClose = (deps) => {
  const { render, store } = deps;
  store.closePreviewSoundSelector();
  render();
};

export const handlePreviewSoundSelected = (deps, payload) => {
  const { render, store } = deps;
  const { soundId } = payload._event.detail;
  store.setPreviewSoundSelectorSelectedSoundId({ soundId });
  render();
};

export const handleConfirmSoundSelection = (deps) => {
  const { render, store } = deps;
  store.confirmPreviewSoundSelection();
  render();
};

const openAddPropertyDialog = (deps, { side } = {}) => {
  const { refs, render, store } = deps;
  store.openAddPropertyDialog({ side });
  render();
  refs.addPropertyForm.reset();
  refs.addPropertyForm.setValues({
    values: store.selectViewData().addPropertyFormDefaults,
  });
};

export const handleAddPropertyClick = (deps, payload) => {
  const { render, store } = deps;
  const event = payload._event;
  const { side } = event.currentTarget.dataset;
  if (side) {
    openAddPropertyDialog(deps, { side });
    return;
  }

  store.openAddPropertySideMenu({
    x: event.clientX,
    y: event.clientY,
  });
  render();
};

export const handleAddPropertySideMenuItemClick = (deps, payload) => {
  const side = payload._event.detail.item.value;
  if (side !== "prev" && side !== "next") {
    return;
  }

  openAddPropertyDialog(deps, { side });
};

export const handleAddPropertySideMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeAddPropertySideMenu();
  render();
};

export const handleAddPropertyDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeAddPropertyDialog();
  render();
};

export const handleAddPropertyFormAction = (deps, payload) => {
  const { store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }
  store.addAudioEffectProperty({
    property: values.property,
    side: store.selectAddPropertySide(),
  });
  commitAudioEffectEdit(deps);
};

export const handleRemovePropertyClick = (deps) => {
  const { appService, store } = deps;
  const copy = selectCopy(deps);
  if (!store.selectViewData().canRemoveSelectedProperty) {
    appService.showAlert({
      title: copy.warningTitle ?? "Warning",
      message:
        copy.updatePropertyRequired ??
        "An audio effect must contain at least one property.",
    });
    return;
  }

  const selectedProperty = store.selectSelectedProperty();
  if (!selectedProperty) {
    return;
  }
  store.removeAudioEffectProperty(selectedProperty);
  commitAudioEffectEdit(deps);
};

const openKeyframeForm = (
  deps,
  {
    add,
    index,
    property,
    side = "update",
    delay,
    duration,
    followingDelay,
  } = {},
) => {
  const { refs, render, store } = deps;
  store.openKeyframeDialog({
    add,
    index,
    property,
    side,
    delay,
    duration,
    followingDelay,
  });
  render();
  refs.keyframeForm.reset();
  refs.keyframeForm.setValues({
    values: store.selectKeyframeDialogValues(),
  });
};

export const handleAddKeyframeFromTimeline = (deps, payload) => {
  const { store } = deps;
  const { delay, duration, followingDelay, index, property, side } =
    payload._event.detail;
  if (
    !["update", "prev", "next"].includes(side) ||
    !AUDIO_EFFECT_PROPERTY_CONFIG[property]
  ) {
    return;
  }

  const result = buildAudioEffectKeyframe({
    property,
    values: {
      useStartValue: false,
      relative: false,
      value: AUDIO_EFFECT_PROPERTY_CONFIG[property].defaultValue,
      delay: delay ?? 0,
      duration: duration ?? 1000,
      easing: "linear",
    },
  });
  if (!result.valid) {
    return;
  }

  store.addKeyframe({
    followingDelay,
    index,
    keyframe: result.keyframe,
    property,
    side,
  });
  commitAudioEffectEdit(deps);
};

export const handleKeyframeClick = (deps, payload) => {
  const { render, store } = deps;
  const { index, property, side } = payload._event.detail;
  store.setSelectedKeyframe({
    side,
    property,
    index,
  });
  render();
};

export const handleKeyframeRightClick = (deps, payload) => {
  const { render, store } = deps;
  const { index, property, side, x, y } = payload._event.detail;
  store.setSelectedKeyframe({ side, property, index });
  store.openKeyframeMenu({ side, property, index, x, y });
  render();
};

export const handleKeyframeMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeKeyframeMenu();
  render();
};

const createDefaultKeyframe = ({ property }) => {
  return buildAudioEffectKeyframe({
    property,
    values: {
      useStartValue: false,
      relative: false,
      value: AUDIO_EFFECT_PROPERTY_CONFIG[property]?.defaultValue,
      delay: 0,
      duration: 1000,
      easing: "linear",
    },
  });
};

export const handleKeyframeDropdownItemClick = (deps, payload) => {
  const { render, store } = deps;
  const { index, property, side } = store.selectKeyframeMenu();
  const { value } = payload._event.detail.item;

  if (value === "edit") {
    store.closeKeyframeMenu();
    if (store.selectIsTouchMode()) {
      openKeyframeForm(deps, {
        add: false,
        side,
        property,
        index,
      });
    } else {
      render();
    }
    return;
  }

  if (value === "delete-keyframe") {
    store.removeKeyframe({ side, property, index });
  } else if (value === "add-left" || value === "add-right") {
    const result = createDefaultKeyframe({ property });
    if (!result.valid) {
      return;
    }
    store.addKeyframe({
      index: value === "add-left" ? index : index + 1,
      keyframe: result.keyframe,
      property,
      side,
    });
  } else {
    return;
  }

  store.closeKeyframeMenu();
  commitAudioEffectEdit(deps);
};

export const handleSelectedKeyframeEditClick = (deps) => {
  const { store } = deps;
  const selectedKeyframe = store.selectSelectedKeyframe();
  if (!selectedKeyframe) {
    return;
  }

  openKeyframeForm(deps, {
    add: false,
    side: selectedKeyframe.side,
    property: selectedKeyframe.property,
    index: selectedKeyframe.index,
  });
};

export const handleKeyframeSelect = (deps, payload) => {
  const { render, store } = deps;
  const { index, property, side } = payload._event.detail;
  store.setSelectedKeyframe({
    side,
    property,
    index,
  });
  render();
};

export const handlePropertyNameClick = (deps, payload) => {
  const { render, store } = deps;
  const { property, side } = payload._event.detail;
  store.setSelectedProperty({ side, property });
  render();
};

export const handleKeyframeDurationChange = (deps, payload) => {
  const { store } = deps;
  const { delay, duration, followingDelay, index, property, side } =
    payload._event.detail;
  store.updateKeyframeTiming({
    property,
    index,
    delay,
    duration,
    followingDelay,
    side,
  });
  commitAudioEffectEdit(deps);
};

export const handleTimelineDurationExtend = (deps, payload) => {
  const { render, store } = deps;
  store.setTimelineDuration({ duration: payload._event.detail.duration });
  render();
};

const resolveValueChange = (payload) => {
  return (
    payload._event.detail?.value ??
    payload._event.currentTarget?.value ??
    payload._event.target?.value
  );
};

export const handleSelectedKeyframeDelayChange = (deps, payload) => {
  const { store } = deps;
  store.setSelectedKeyframeDelay({ delay: resolveValueChange(payload) });
  commitAudioEffectEdit(deps);
};

export const handleSelectedKeyframeDurationChange = (deps, payload) => {
  const { store } = deps;
  store.setSelectedKeyframeDuration({ duration: resolveValueChange(payload) });
  commitAudioEffectEdit(deps);
};

export const handleSelectedKeyframeEasingChange = (deps, payload) => {
  const { store } = deps;
  store.setSelectedKeyframeEasing({ easing: resolveValueChange(payload) });
  commitAudioEffectEdit(deps);
};

export const handleSelectedKeyframeValueChange = (deps, payload) => {
  const { store } = deps;
  store.setSelectedKeyframeValue({ value: resolveValueChange(payload) });
  commitAudioEffectEdit(deps);
};

export const handleSelectedKeyframeStartValueChange = (deps, payload) => {
  const { store } = deps;
  store.setSelectedKeyframeStartValue({
    startValue: resolveValueChange(payload),
  });
  commitAudioEffectEdit(deps);
};

export const handleSelectedKeyframeRemoveStartValueClick = (deps) => {
  const { store } = deps;
  store.setSelectedKeyframeStartValue({ startValue: undefined });
  commitAudioEffectEdit(deps);
};

export const handleSelectedKeyframeAddClick = (deps, payload) => {
  const { render, store } = deps;
  if (!store.selectSelectedKeyframe()) {
    return;
  }

  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.openSelectedKeyframeAddMenu({
    x: rect.left,
    y: rect.bottom,
  });
  render();
};

export const handleSelectedKeyframeAddMenuItemClick = (deps, payload) => {
  const { store } = deps;
  if (payload._event.detail.item.value !== "start-value") {
    return;
  }

  store.setSelectedKeyframeStartValue({
    startValue: store.selectDefaultSelectedKeyframeStartValue(),
  });
  store.closeSelectedKeyframeAddMenu();
  commitAudioEffectEdit(deps);
};

export const handleSelectedKeyframeAddMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeSelectedKeyframeAddMenu();
  render();
};

export const handleSelectedKeyframeRelativeChange = (deps, payload) => {
  const { store } = deps;
  store.setSelectedKeyframeRelative({ relative: resolveValueChange(payload) });
  commitAudioEffectEdit(deps);
};

export const handleSelectedPropertyInitialValueChange = (deps, payload) => {
  const { store } = deps;
  store.setSelectedPropertyInitialValue({
    initialValue: resolveValueChange(payload),
  });
  commitAudioEffectEdit(deps);
};

export const handleSelectedPropertyValueSourceChange = (deps, payload) => {
  const { store } = deps;
  store.setSelectedPropertyValueSource({
    valueSource: resolveValueChange(payload),
  });
  commitAudioEffectEdit(deps);
};

export const handleKeyframeDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeKeyframeDialog();
  render();
};

export const handleKeyframeFormAction = (deps, payload) => {
  const { appService, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId === "delete") {
    store.removeKeyframe({
      side: store.selectKeyframeDialogSide(),
      property: store.selectKeyframeDialogProperty(),
      index: store.selectSelectedKeyframe()?.index,
    });
    store.closeKeyframeDialog();
    commitAudioEffectEdit(deps);
    return;
  }
  if (actionId !== "submit") {
    return;
  }

  const finalKeyframe = store.selectKeyframeDialogIsFinal();
  const result = buildAudioEffectKeyframe({
    finalKeyframe,
    property: store.selectKeyframeDialogProperty(),
    values,
  });
  if (!result.valid) {
    appService.showAlert({
      title: copy.warningTitle ?? "Warning",
      message: copy.invalidKeyframe ?? result.error,
    });
    return;
  }

  store.applyKeyframe({ keyframe: result.keyframe });
  commitAudioEffectEdit(deps);
};
