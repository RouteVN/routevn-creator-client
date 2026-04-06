import {
  addKeyframe,
  addProperty,
  closeDialog,
  closePopover,
  createInitialState as createSharedInitialState,
  deleteKeyframe,
  deleteProperty,
  moveKeyframeLeft,
  moveKeyframeRight,
  openDialog,
  selectAnimationDisplayItemById,
  selectAnimationItemById,
  selectAnimationRenderState,
  selectAnimationRenderStateWithAnimations,
  selectAnimationResetState,
  selectDefaultInitialValue,
  selectDialogType,
  selectEditItemId,
  selectEditMode,
  selectPopover,
  selectProjectResolution,
  selectProperties,
  selectTargetGroupId,
  selectViewData as selectSharedViewData,
  setItems,
  setPopover,
  setProjectResolution,
  setSelectedItemId,
  setTargetGroupId,
  updateInitialValue,
  updateKeyframe,
  updatePopoverFormValues,
} from "../animations/animations.store.js";

export const createInitialState = () => {
  return {
    ...createSharedInitialState(),
    autosaveVersion: 0,
    autosavePersistedVersion: 0,
    autosaveInFlight: false,
    previewPlaybackMode: "auto",
    previewRenderVersion: 0,
    previewPreparedVersion: undefined,
    previewPlayheadTimeMs: undefined,
    previewPlayheadVisible: false,
    previewPlaybackFrameId: undefined,
    previewPlaybackStartedAtMs: undefined,
    previewPlaybackDurationMs: undefined,
  };
};

export {
  addKeyframe,
  addProperty,
  closeDialog,
  closePopover,
  deleteKeyframe,
  deleteProperty,
  moveKeyframeLeft,
  moveKeyframeRight,
  openDialog,
  selectAnimationDisplayItemById,
  selectAnimationItemById,
  selectAnimationRenderState,
  selectAnimationRenderStateWithAnimations,
  selectAnimationResetState,
  selectDefaultInitialValue,
  selectDialogType,
  selectEditItemId,
  selectEditMode,
  selectPopover,
  selectProjectResolution,
  selectProperties,
  selectTargetGroupId,
  setItems,
  setPopover,
  setProjectResolution,
  setSelectedItemId,
  setTargetGroupId,
  updateInitialValue,
  updateKeyframe,
  updatePopoverFormValues,
};

export const setAnimationName = ({ state }, { name } = {}) => {
  state.dialogDefaultValues.name = name ?? "";
};

export const selectAnimationName = ({ state }) => {
  return state.dialogDefaultValues.name ?? "";
};

export const setAnimationDescription = ({ state }, { description } = {}) => {
  state.dialogDefaultValues.description = description ?? "";
};

export const selectAnimationDescription = ({ state }) => {
  return state.dialogDefaultValues.description ?? "";
};

export const queueAutosave = ({ state }, _payload = {}) => {
  state.autosaveVersion += 1;
};

export const markAutosavePersisted = ({ state }, { version } = {}) => {
  state.autosavePersistedVersion = version ?? state.autosaveVersion;
};

export const setAutosaveInFlight = ({ state }, { inFlight } = {}) => {
  state.autosaveInFlight = inFlight ?? false;
};

export const selectAutosaveVersion = ({ state }) => {
  return state.autosaveVersion;
};

export const selectAutosavePersistedVersion = ({ state }) => {
  return state.autosavePersistedVersion;
};

export const selectAutosaveInFlight = ({ state }) => {
  return state.autosaveInFlight;
};

export const markAnimationPersisted = ({ state }, { animationId } = {}) => {
  state.editMode = true;
  state.editItemId = animationId;
  state.selectedItemId = animationId;
};

export const bumpPreviewRenderVersion = ({ state }, _payload = {}) => {
  state.previewRenderVersion += 1;
  state.previewPreparedVersion = undefined;
};

export const setPreviewPlaybackMode = ({ state }, { mode } = {}) => {
  state.previewPlaybackMode = mode ?? "auto";
  if (state.previewPlaybackMode !== "manual") {
    state.previewPreparedVersion = undefined;
  }
};

export const markPreviewPrepared = ({ state }, _payload = {}) => {
  state.previewPreparedVersion = state.previewRenderVersion;
};

export const selectPreviewPlaybackMode = ({ state }) => {
  return state.previewPlaybackMode;
};

export const selectPreviewRenderVersion = ({ state }) => {
  return state.previewRenderVersion;
};

export const selectPreviewPreparedVersion = ({ state }) => {
  return state.previewPreparedVersion;
};

export const startPreviewPlayback = (
  { state },
  { startedAtMs, durationMs } = {},
) => {
  state.previewPlaybackStartedAtMs = startedAtMs;
  state.previewPlaybackDurationMs = durationMs;
  state.previewPlayheadTimeMs = 0;
  state.previewPlayheadVisible = true;
  state.previewPlaybackFrameId = undefined;
};

export const setPreviewPlayhead = ({ state }, { timeMs, visible } = {}) => {
  state.previewPlayheadTimeMs = timeMs;
  state.previewPlayheadVisible = visible ?? state.previewPlayheadVisible;
};

export const setPreviewPlaybackFrameId = ({ state }, { frameId } = {}) => {
  state.previewPlaybackFrameId = frameId;
};

export const stopPreviewPlayback = ({ state }, _payload = {}) => {
  state.previewPlayheadTimeMs = undefined;
  state.previewPlayheadVisible = false;
  state.previewPlaybackFrameId = undefined;
  state.previewPlaybackStartedAtMs = undefined;
  state.previewPlaybackDurationMs = undefined;
};

export const selectPreviewPlayheadTimeMs = ({ state }) => {
  return state.previewPlayheadTimeMs;
};

export const selectPreviewPlayheadVisible = ({ state }) => {
  return state.previewPlayheadVisible;
};

export const selectPreviewPlaybackFrameId = ({ state }) => {
  return state.previewPlaybackFrameId;
};

export const selectPreviewPlaybackStartedAtMs = ({ state }) => {
  return state.previewPlaybackStartedAtMs;
};

export const selectPreviewPlaybackDurationMs = ({ state }) => {
  return state.previewPlaybackDurationMs;
};

export const selectViewData = (context) => {
  const viewData = selectSharedViewData(context);

  return {
    ...viewData,
    animationName: viewData.dialogDefaultValues?.name ?? "",
    previewPlayheadTimeMs: context.state.previewPlayheadTimeMs,
    previewPlayheadVisible: context.state.previewPlayheadVisible,
    dialogTypeLabel:
      viewData.dialogType === "transition" ? "Transition" : "Update",
  };
};
