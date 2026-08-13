import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  getAudioEffectDefinitionDuration,
  getTransitionFadeKeyframes,
  normalizeAudioEffectDefinition,
} from "../../internal/audioEffectDefinition.js";
import {
  AUDIO_EFFECT_KEYFRAME_MENU_ITEMS,
  AUDIO_EFFECT_PROPERTY_CONFIG,
  AUDIO_EFFECT_PROPERTY_KEYS,
  SUPPORTED_AUDIO_EFFECT_EASINGS,
} from "./audioEffectsEditor.constants.js";
import { selectAudioEffectsEditorPageCopy } from "./support/audioEffectsEditorPageCopy.js";

const TIMELINE_ZOOM_DEFAULT = 2;
const TIMELINE_ZOOM_MIN = 0.25;
const TIMELINE_ZOOM_MAX = 4;
const TIMELINE_ZOOM_STEP = 0.125;
const TIMELINE_BASE_PIXELS_PER_SECOND = 200;
const TIMELINE_PROPERTY_COLUMN_WIDTH = 104;
const TIMELINE_VIEWPORT_PADDING = 32;

const createDefaultUpdateKeyframe = (property) => ({
  value: AUDIO_EFFECT_PROPERTY_CONFIG[property]?.defaultValue ?? 0,
  duration: 300,
  easing: "easeInOutSine",
});

const formatEasingLabel = (easing) =>
  easing
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());

const getPropertyLabel = (property, copy = {}) => {
  const labels = {
    volume: copy.volumePropertyLabel ?? "Volume",
    pan: copy.panPropertyLabel ?? "Pan",
    playbackRate: copy.playbackRatePropertyLabel ?? "Playback Rate",
  };
  return labels[property] ?? property;
};

const cloneDefinition = (definition) => structuredClone(definition);

const createDefaultDefinition = () => ({
  type: "update",
  tween: {
    volume: {
      keyframes: [createDefaultUpdateKeyframe("volume")],
    },
  },
});

const createEasingOptions = () =>
  SUPPORTED_AUDIO_EFFECT_EASINGS.map((easing) => ({
    label: formatEasingLabel(easing),
    value: easing,
  }));

const createAddPropertyForm = (availableProperties, copy = {}) => ({
  title: copy.addPropertyTitle ?? "Add Audio Property",
  fields: [
    {
      name: "property",
      type: "select",
      label: copy.propertyLabel ?? "Property",
      options: availableProperties.map((property) => ({
        label: getPropertyLabel(property, copy),
        value: property,
      })),
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.addPropertyButton ?? "Add Property",
      },
    ],
  },
});

const createKeyframeForm = ({
  add = false,
  fixedValue,
  finalKeyframe = false,
  property,
  transitionKeyframe = false,
  copy,
} = {}) => {
  const propertyConfig = AUDIO_EFFECT_PROPERTY_CONFIG[property] ?? {};
  const actions = [];
  if (!add && !finalKeyframe) {
    actions.push({
      id: "delete",
      variant: "se",
      label: copy.deleteKeyframeButton ?? "Delete Keyframe",
    });
  }
  actions.push({
    id: "submit",
    variant: "pr",
    label: add
      ? (copy.addKeyframeButton ?? "Add Keyframe")
      : (copy.updateKeyframeButton ?? "Update"),
  });
  const fields = [
    {
      name: "useStartValue",
      type: "segmented-control",
      label: copy.startValueLabel ?? "Start value",
      noClear: true,
      options: [
        { label: copy.currentValueOption ?? "Current value", value: false },
        { label: copy.customValueOption ?? "Custom", value: true },
      ],
      required: true,
    },
    {
      $when: "useStartValue == true",
      name: "startValue",
      type: "input-number",
      label: copy.customStartValueLabel ?? "Custom start value",
      step: propertyConfig.step ?? 0.01,
      required: true,
    },
  ];

  if (!finalKeyframe && !transitionKeyframe) {
    fields.push({
      name: "relative",
      type: "segmented-control",
      label: copy.valueTypeLabel ?? "Value type",
      noClear: true,
      options: [
        { label: copy.absoluteValueType ?? "Absolute", value: false },
        { label: copy.relativeValueType ?? "Relative", value: true },
      ],
      required: true,
    });
  }

  fields.push({
    name: "value",
    type: "input-number",
    label: copy.valueLabel ?? "Value",
    step: propertyConfig.step ?? 0.01,
    disabled: fixedValue !== undefined,
    required: true,
  });

  fields.push(
    {
      name: "delay",
      type: "input-number",
      label: copy.delayMsLabel ?? "Delay (ms)",
      min: 0,
      step: 1,
      required: true,
    },
    {
      name: "duration",
      type: "input-number",
      label: copy.durationMsLabel ?? "Duration (ms)",
      min: 0,
      step: 1,
      required: true,
    },
    {
      name: "easing",
      type: "select",
      label: copy.easingLabel ?? "Easing",
      options: createEasingOptions(),
      required: true,
    },
  );

  return {
    title: add
      ? (copy.addKeyframeTitle ?? "Add Keyframe")
      : (copy.editKeyframeTitle ?? "Edit Keyframe"),
    fields,
    actions: {
      layout: "",
      buttons: actions,
    },
  };
};

const formatKeyframeValue = (keyframe) => {
  return keyframe.relative === true
    ? `+ ${keyframe.value}`
    : `${keyframe.value}`;
};

const resolveTimelineDuration = (definition = {}) => {
  const usedDuration = getAudioEffectDefinitionDuration(definition);
  return Math.max(1000, Math.ceil(usedDuration / 1000) * 1000);
};

const createTimelineKeyframes = (keyframes = []) =>
  keyframes.map((keyframe) => ({
    ...cloneDefinition(keyframe),
    duration: Math.max(1, Number(keyframe.duration) || 0),
  }));

const createUpdateTimelineProperties = (tween = {}, copy = {}) =>
  Object.fromEntries(
    Object.entries(tween).map(([property, config]) => [
      property,
      {
        ...cloneDefinition(config),
        label: getPropertyLabel(property, copy),
        initialValue: config.keyframes?.[0]?.startValue,
        keyframes: createTimelineKeyframes(config.keyframes),
      },
    ]),
  );

const createFadeTimelineProperties = ({ definition, side, copy } = {}) => {
  const keyframes = getTransitionFadeKeyframes(definition, side);
  if (keyframes.length === 0) {
    return {};
  }

  const previous = side === "prev";
  return {
    fade: {
      label: copy.fadePropertyLabel ?? "Fade",
      initialValue: keyframes[0]?.startValue ?? (previous ? 100 : 0),
      keyframes: createTimelineKeyframes(keyframes),
    },
  };
};

const TIMELINE_DEFAULT_VALUES = Object.freeze(
  Object.fromEntries(
    Object.entries(AUDIO_EFFECT_PROPERTY_CONFIG).map(([property, config]) => [
      property,
      config.defaultValue,
    ]),
  ),
);

export const createInitialState = () => ({
  audioEffectId: undefined,
  audioEffectName: "",
  definition: createDefaultDefinition(),
  selectedEditorTab: "timeline",
  soundsData: { items: {}, tree: [] },
  previewSoundIds: {
    outgoing: undefined,
    incoming: undefined,
    target: undefined,
  },
  previewSoundSelector: {
    open: false,
    target: undefined,
    selectedSoundId: undefined,
  },
  previewLoading: false,
  previewLoopEnabled: false,
  previewPlaying: false,
  previewPlaybackFrameId: undefined,
  previewPlaybackStartedAtMs: undefined,
  previewPlaybackDurationMs: undefined,
  previewPlaybackRequestId: undefined,
  previewPlayheadTimeMs: undefined,
  previewPlayheadVisible: false,
  previewRuntimeReady: false,
  isTouchMode: false,
  dirty: false,
  saving: false,
  timelineDuration: 1000,
  timelineZoom: TIMELINE_ZOOM_DEFAULT,
  timelineViewportWidth: undefined,
  selectedKeyframe: undefined,
  selectedProperty: undefined,
  keyframeMenu: {
    open: false,
    x: undefined,
    y: undefined,
    side: undefined,
    property: undefined,
    index: undefined,
  },
  addPropertyDialogOpen: false,
  keyframeDialog: {
    open: false,
    side: undefined,
    property: undefined,
    index: undefined,
    add: false,
    delay: undefined,
    duration: undefined,
    followingDelay: undefined,
  },
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

export const loadAudioEffect = ({ state }, { item } = {}) => {
  state.audioEffectId = item.id;
  state.audioEffectName = item.name ?? "";
  state.definition = normalizeAudioEffectDefinition(item.audioEffect);
  state.previewSoundIds.outgoing = item.preview?.outgoing?.soundId;
  state.previewSoundIds.incoming = item.preview?.incoming?.soundId;
  state.previewSoundIds.target = item.preview?.target?.soundId;
  state.previewSoundSelector.open = false;
  state.previewSoundSelector.target = undefined;
  state.previewSoundSelector.selectedSoundId = undefined;
  state.selectedEditorTab = "timeline";
  state.previewPlaybackFrameId = undefined;
  state.previewPlaybackStartedAtMs = undefined;
  state.previewPlaybackDurationMs = undefined;
  state.previewPlaybackRequestId = undefined;
  state.previewPlayheadTimeMs = undefined;
  state.previewPlayheadVisible = false;
  state.previewPlaying = false;
  state.timelineDuration = resolveTimelineDuration(state.definition);
  state.timelineZoom = TIMELINE_ZOOM_DEFAULT;
  state.timelineViewportWidth = undefined;
  state.selectedKeyframe = undefined;
  state.selectedProperty = undefined;
  closeKeyframeMenu({ state });
  state.dirty = false;
};

export const selectAudioEffectId = ({ state }) => state.audioEffectId;
export const selectAudioEffectDefinition = ({ state }) =>
  cloneDefinition(state.definition);
export const selectDirty = ({ state }) => state.dirty;
export const selectSelectedEditorTab = ({ state }) => state.selectedEditorTab;
export const selectPreviewRuntimeReady = ({ state }) =>
  state.previewRuntimeReady;
export const selectPreviewLoopEnabled = ({ state }) => state.previewLoopEnabled;
export const selectPreviewPlaying = ({ state }) => state.previewPlaying;
export const selectPreviewPlaybackFrameId = ({ state }) =>
  state.previewPlaybackFrameId;
export const selectPreviewPlaybackStartedAtMs = ({ state }) =>
  state.previewPlaybackStartedAtMs;
export const selectPreviewPlaybackDurationMs = ({ state }) =>
  state.previewPlaybackDurationMs;
export const selectPreviewPlaybackRequestId = ({ state }) =>
  state.previewPlaybackRequestId;
export const selectAudioEffectDuration = ({ state }) =>
  getAudioEffectDefinitionDuration(state.definition);
export const selectPreviewSoundSelectorTarget = ({ state }) =>
  state.previewSoundSelector.target;
export const selectSelectedKeyframe = ({ state }) => state.selectedKeyframe;
export const selectSelectedProperty = ({ state }) => state.selectedProperty;
export const selectIsTouchMode = ({ state }) => state.isTouchMode;
export const selectKeyframeMenu = ({ state }) => state.keyframeMenu;
export const selectKeyframeDialogProperty = ({ state }) =>
  state.keyframeDialog.property;
export const selectKeyframeDialogSide = ({ state }) =>
  state.keyframeDialog.side;
export const selectKeyframeDialogIsFinal = ({ state }) => {
  const { add, index, property, side } = state.keyframeDialog;
  const keyframes = getMutableKeyframes(state, { side, property }) ?? [];
  return !add && index === keyframes.length - 1;
};

export const setSaving = ({ state }, { saving } = {}) => {
  state.saving = saving === true;
};

export const markSaved = ({ state }) => {
  state.dirty = false;
};

export const setSoundsData = ({ state }, { soundsData } = {}) => {
  state.soundsData = soundsData ?? { items: {}, tree: [] };
};

export const setSelectedEditorTab = ({ state }, { tab } = {}) => {
  if (tab === "timeline" || tab === "preview") {
    state.selectedEditorTab = tab;
  }
};

export const openPreviewSoundSelector = ({ state }, { target } = {}) => {
  if (!new Set(["outgoing", "incoming", "target"]).has(target)) {
    return;
  }
  state.previewSoundSelector.open = true;
  state.previewSoundSelector.target = target;
  state.previewSoundSelector.selectedSoundId = state.previewSoundIds[target];
};

export const closePreviewSoundSelector = ({ state }) => {
  state.previewSoundSelector.open = false;
  state.previewSoundSelector.target = undefined;
  state.previewSoundSelector.selectedSoundId = undefined;
};

export const setPreviewSoundSelectorSelectedSoundId = (
  { state },
  { soundId } = {},
) => {
  const sound = state.soundsData.items?.[soundId];
  if (sound?.type !== "sound") {
    return;
  }
  state.previewSoundSelector.selectedSoundId = soundId;
};

export const confirmPreviewSoundSelection = ({ state }) => {
  const { selectedSoundId, target } = state.previewSoundSelector;
  const sound = state.soundsData.items?.[selectedSoundId];
  if (!target || sound?.type !== "sound") {
    return;
  }
  state.previewSoundIds[target] = selectedSoundId;
  closePreviewSoundSelector({ state });
};

export const setPreviewLoading = ({ state }, { loading } = {}) => {
  state.previewLoading = loading === true;
};

export const togglePreviewLoop = ({ state }) => {
  state.previewLoopEnabled = !state.previewLoopEnabled;
};

export const setPreviewPlaying = ({ state }, { playing } = {}) => {
  state.previewPlaying = playing === true;
};

export const startPreviewPlayback = (
  { state },
  { startedAtMs, durationMs } = {},
) => {
  state.previewPlaybackStartedAtMs = startedAtMs;
  state.previewPlaybackDurationMs = durationMs;
  state.previewPlaybackFrameId = undefined;
  state.previewPlayheadTimeMs = 0;
  state.previewPlayheadVisible = true;
};

export const setPreviewPlaybackFrameId = ({ state }, { frameId } = {}) => {
  state.previewPlaybackFrameId = frameId;
};

export const setPreviewPlayhead = ({ state }, { timeMs } = {}) => {
  state.previewPlayheadTimeMs = timeMs;
  state.previewPlayheadVisible = true;
};

export const stopPreviewPlayback = ({ state }) => {
  state.previewPlaybackFrameId = undefined;
  state.previewPlaybackStartedAtMs = undefined;
  state.previewPlaybackDurationMs = undefined;
  state.previewPlayheadTimeMs = undefined;
  state.previewPlayheadVisible = false;
};

export const setPreviewPlaybackRequestId = ({ state }, { requestId } = {}) => {
  state.previewPlaybackRequestId = requestId;
};

export const setPreviewRuntimeReady = ({ state }, { ready } = {}) => {
  state.previewRuntimeReady = ready === true;
};

export const selectAudioEffectPreview = ({ state }) => ({
  outgoingSound: state.soundsData.items?.[state.previewSoundIds.outgoing],
  incomingSound: state.soundsData.items?.[state.previewSoundIds.incoming],
  targetSound: state.soundsData.items?.[state.previewSoundIds.target],
});

const createPreviewSoundSlot = (soundId) => {
  if (!soundId) {
    return {};
  }
  return { soundId };
};

export const selectAudioEffectPreviewData = ({ state }) =>
  state.definition.type === "transition"
    ? {
        outgoing: createPreviewSoundSlot(state.previewSoundIds.outgoing),
        incoming: createPreviewSoundSlot(state.previewSoundIds.incoming),
      }
    : {
        target: createPreviewSoundSlot(state.previewSoundIds.target),
      };

const getMutableKeyframes = (state, { side = "update", property } = {}) => {
  if (side === "update") {
    return state.definition.tween?.[property]?.keyframes;
  }
  if (
    state.definition.type === "transition" &&
    (side === "prev" || side === "next") &&
    property === "fade"
  ) {
    return state.definition[side]?.fade?.keyframes;
  }
  return undefined;
};

export const updateTransitionTiming = (
  { state },
  { side, delay, duration } = {},
) => {
  updateKeyframeTiming(
    { state },
    { side, property: "fade", index: 0, delay, duration },
  );
};

export const setTimelineDuration = ({ state }, { duration } = {}) => {
  const nextDuration = Number(duration);
  if (Number.isFinite(nextDuration) && nextDuration > state.timelineDuration) {
    state.timelineDuration = nextDuration;
  }
};

export const setTimelineZoom = ({ state }, { zoom } = {}) => {
  const numericZoom = Number(zoom);
  if (!Number.isFinite(numericZoom)) {
    return;
  }
  state.timelineZoom = Math.min(
    TIMELINE_ZOOM_MAX,
    Math.max(TIMELINE_ZOOM_MIN, numericZoom),
  );
};

export const nudgeTimelineZoom = ({ state }, { delta } = {}) => {
  setTimelineZoom({ state }, { zoom: state.timelineZoom + Number(delta ?? 0) });
};

export const setTimelineViewportWidth = ({ state }, { viewportWidth } = {}) => {
  const numericWidth = Number(viewportWidth);
  state.timelineViewportWidth = Number.isFinite(numericWidth)
    ? Math.max(0, numericWidth)
    : undefined;
};

export const selectTimelineViewportWidth = ({ state }) =>
  state.timelineViewportWidth;

export const setSelectedKeyframe = (
  { state },
  { side = "update", property, index } = {},
) => {
  const resolvedIndex = Number(index);
  const keyframe = getMutableKeyframes(state, { side, property })?.[
    resolvedIndex
  ];
  state.selectedKeyframe = keyframe
    ? { side, property, index: resolvedIndex }
    : undefined;
  state.selectedProperty = undefined;
};

export const setSelectedProperty = (
  { state },
  { side = "update", property } = {},
) => {
  const propertyExists =
    (side === "update" && state.definition.tween?.[property] !== undefined) ||
    ((side === "prev" || side === "next") &&
      property === "fade" &&
      getMutableKeyframes(state, { side, property }) !== undefined);
  state.selectedProperty = propertyExists ? { side, property } : undefined;
  state.selectedKeyframe = undefined;
};

export const openKeyframeMenu = (
  { state },
  { x, y, side = "update", property, index } = {},
) => {
  state.keyframeMenu.open = true;
  state.keyframeMenu.x = x;
  state.keyframeMenu.y = y;
  state.keyframeMenu.side = side;
  state.keyframeMenu.property = property;
  state.keyframeMenu.index = Number(index);
};

export const closeKeyframeMenu = ({ state }) => {
  state.keyframeMenu.open = false;
  state.keyframeMenu.x = undefined;
  state.keyframeMenu.y = undefined;
  state.keyframeMenu.side = undefined;
  state.keyframeMenu.property = undefined;
  state.keyframeMenu.index = undefined;
};

export const openAddPropertyDialog = ({ state }) => {
  state.addPropertyDialogOpen = true;
};

export const closeAddPropertyDialog = ({ state }) => {
  state.addPropertyDialogOpen = false;
};

export const addTweenProperty = ({ state }, { property } = {}) => {
  if (
    !AUDIO_EFFECT_PROPERTY_KEYS.includes(property) ||
    state.definition.type !== "update" ||
    state.definition.tween[property]
  ) {
    return;
  }

  state.definition.tween[property] = {
    keyframes: [createDefaultUpdateKeyframe(property)],
  };
  state.selectedProperty = { side: "update", property };
  state.selectedKeyframe = undefined;
  state.addPropertyDialogOpen = false;
  state.dirty = true;
};

export const removeTweenProperty = ({ state }, { property } = {}) => {
  if (
    state.definition.type !== "update" ||
    Object.keys(state.definition.tween).length <= 1
  ) {
    return;
  }

  delete state.definition.tween[property];
  if (state.selectedProperty?.property === property) {
    state.selectedProperty = undefined;
  }
  if (state.selectedKeyframe?.property === property) {
    state.selectedKeyframe = undefined;
  }
  state.dirty = true;
};

export const openKeyframeDialog = (
  { state },
  {
    side = "update",
    property,
    index,
    add = false,
    delay,
    duration,
    followingDelay,
  } = {},
) => {
  state.keyframeDialog.open = true;
  state.keyframeDialog.side = side;
  state.keyframeDialog.property = property;
  state.keyframeDialog.index = index;
  state.keyframeDialog.add = add;
  state.keyframeDialog.delay = delay;
  state.keyframeDialog.duration = duration;
  state.keyframeDialog.followingDelay = followingDelay;
  if (!add && Number.isInteger(index)) {
    state.selectedKeyframe = { side, property, index };
    state.selectedProperty = undefined;
  }
};

export const closeKeyframeDialog = ({ state }) => {
  state.keyframeDialog.open = false;
  state.keyframeDialog.side = undefined;
  state.keyframeDialog.property = undefined;
  state.keyframeDialog.index = undefined;
  state.keyframeDialog.add = false;
  state.keyframeDialog.delay = undefined;
  state.keyframeDialog.duration = undefined;
  state.keyframeDialog.followingDelay = undefined;
};

const insertKeyframe = (
  state,
  { followingDelay, index, keyframe, property, side = "update" } = {},
) => {
  const keyframes = getMutableKeyframes(state, { side, property });
  if (!keyframes || keyframes.length === 0 || !keyframe) {
    return undefined;
  }

  const requestedIndex = Number.isInteger(index) ? index : keyframes.length;
  let insertionIndex = Math.min(Math.max(0, requestedIndex), keyframes.length);
  if (side === "next" && property === "fade") {
    insertionIndex = Math.min(insertionIndex, keyframes.length - 1);
  }
  keyframes.splice(insertionIndex, 0, cloneDefinition(keyframe));
  if (followingDelay !== undefined) {
    const followingKeyframe = keyframes[insertionIndex + 1];
    const nextDelay = Math.max(0, Number(followingDelay) || 0);
    if (nextDelay > 0) {
      followingKeyframe.delay = nextDelay;
    } else {
      delete followingKeyframe.delay;
    }
  }
  return insertionIndex;
};

export const addKeyframe = (
  { state },
  { followingDelay, index, keyframe, property, side = "update" } = {},
) => {
  const insertionIndex = insertKeyframe(state, {
    followingDelay,
    index,
    keyframe,
    property,
    side,
  });
  if (insertionIndex === undefined) {
    return;
  }

  state.selectedKeyframe = {
    side,
    property,
    index: insertionIndex,
  };
  state.selectedProperty = undefined;
  state.dirty = true;
};

export const applyKeyframe = ({ state }, { keyframe } = {}) => {
  const { add, followingDelay, index, property, side } = state.keyframeDialog;
  const keyframes = getMutableKeyframes(state, { side, property });
  if (!keyframes) {
    return;
  }

  const nextKeyframe = cloneDefinition(keyframe);
  if (side !== "update") {
    delete nextKeyframe.relative;
  }
  const finalKeyframe = !add && index === keyframes.length - 1;
  if (side === "update" && finalKeyframe) {
    delete nextKeyframe.relative;
  }
  if (side === "next" && property === "fade" && finalKeyframe) {
    nextKeyframe.value = 100;
  }

  let applied = false;
  if (add) {
    const insertionIndex = insertKeyframe(state, {
      followingDelay,
      index,
      keyframe: nextKeyframe,
      property,
      side,
    });
    if (insertionIndex === undefined) {
      closeKeyframeDialog({ state });
      return;
    }
    state.selectedKeyframe = {
      side,
      property,
      index: insertionIndex,
    };
    applied = true;
  } else if (Number.isInteger(index) && keyframes[index]) {
    keyframes[index] = nextKeyframe;
    state.selectedKeyframe = { side, property, index };
    applied = true;
  }

  closeKeyframeDialog({ state });
  if (applied) {
    state.dirty = true;
  }
};

export const removeKeyframe = (
  { state },
  { side = "update", property, index } = {},
) => {
  const resolvedIndex = Number(index);
  const keyframes = getMutableKeyframes(state, { side, property });
  const finalKeyframe = resolvedIndex === keyframes?.length - 1;
  const protectedEndpoint =
    finalKeyframe &&
    (side === "update" || (side === "next" && property === "fade"));
  if (
    !keyframes ||
    keyframes.length <= 1 ||
    protectedEndpoint ||
    resolvedIndex < 0 ||
    resolvedIndex >= keyframes.length
  ) {
    return;
  }

  keyframes.splice(resolvedIndex, 1);
  state.selectedKeyframe = undefined;
  state.dirty = true;
};

export const updateKeyframeTiming = (
  { state },
  { property, index, delay, duration, followingDelay, side = "update" } = {},
) => {
  const keyframes = getMutableKeyframes(state, { side, property });
  const keyframe = keyframes?.[Number(index)];
  if (!keyframe) {
    return;
  }

  const nextDelay = Math.max(0, Number(delay) || 0);
  const nextDuration = Math.max(0, Number(duration) || 0);
  if (nextDelay > 0) {
    keyframe.delay = nextDelay;
  } else {
    delete keyframe.delay;
  }
  keyframe.duration = nextDuration;

  const followingKeyframe = keyframes[Number(index) + 1];
  if (followingKeyframe && followingDelay !== undefined) {
    const nextFollowingDelay = Math.max(0, Number(followingDelay) || 0);
    if (nextFollowingDelay > 0) {
      followingKeyframe.delay = nextFollowingDelay;
    } else {
      delete followingKeyframe.delay;
    }
  }

  state.selectedKeyframe = {
    side,
    property,
    index: Number(index),
  };
  state.selectedProperty = undefined;
  state.timelineDuration = Math.max(
    state.timelineDuration,
    resolveTimelineDuration(state.definition),
  );
  state.dirty = true;
};

const getMutableSelectedKeyframe = (state) => {
  const selectedKeyframe = state.selectedKeyframe;
  if (!selectedKeyframe) {
    return undefined;
  }

  const { index, property, side } = selectedKeyframe;
  return getMutableKeyframes(state, { side, property })?.[index];
};

const commitSelectedKeyframeChange = (state) => {
  state.timelineDuration = Math.max(
    state.timelineDuration,
    resolveTimelineDuration(state.definition),
  );
  state.dirty = true;
};

export const selectSelectedKeyframeFormValues = ({ state }) => {
  const keyframe = getMutableSelectedKeyframe(state);
  if (!keyframe) {
    return undefined;
  }

  return {
    delay: keyframe.delay ?? 0,
    duration: keyframe.duration,
    easing: keyframe.easing ?? "linear",
    relative: keyframe.relative ?? false,
    value: keyframe.value,
  };
};

export const setSelectedKeyframeDelay = ({ state }, { delay } = {}) => {
  const keyframe = getMutableSelectedKeyframe(state);
  const nextDelay = Number(delay);
  if (!keyframe || !Number.isFinite(nextDelay) || nextDelay < 0) {
    return;
  }

  if (nextDelay > 0) {
    keyframe.delay = nextDelay;
  } else {
    delete keyframe.delay;
  }
  commitSelectedKeyframeChange(state);
};

export const setSelectedKeyframeDuration = ({ state }, { duration } = {}) => {
  const keyframe = getMutableSelectedKeyframe(state);
  const nextDuration = Number(duration);
  if (!keyframe || !Number.isFinite(nextDuration) || nextDuration < 0) {
    return;
  }

  keyframe.duration = nextDuration;
  commitSelectedKeyframeChange(state);
};

export const setSelectedKeyframeEasing = ({ state }, { easing } = {}) => {
  const keyframe = getMutableSelectedKeyframe(state);
  if (!keyframe || !SUPPORTED_AUDIO_EFFECT_EASINGS.includes(easing)) {
    return;
  }

  keyframe.easing = easing;
  commitSelectedKeyframeChange(state);
};

export const setSelectedKeyframeValue = ({ state }, { value } = {}) => {
  const selectedKeyframe = state.selectedKeyframe;
  const keyframe = getMutableSelectedKeyframe(state);
  const nextValue = Number(value);
  const transitionKeyframe =
    selectedKeyframe?.side === "prev" || selectedKeyframe?.side === "next";
  const keyframes = getMutableKeyframes(state, selectedKeyframe) ?? [];
  const lockedIncomingEndpoint =
    selectedKeyframe?.side === "next" &&
    selectedKeyframe.property === "fade" &&
    selectedKeyframe.index === keyframes.length - 1;
  const propertyConfig = transitionKeyframe
    ? AUDIO_EFFECT_PROPERTY_CONFIG.volume
    : AUDIO_EFFECT_PROPERTY_CONFIG[selectedKeyframe?.property];
  if (
    !keyframe ||
    lockedIncomingEndpoint ||
    !Number.isFinite(nextValue) ||
    (!keyframe.relative &&
      ((propertyConfig.min !== undefined && nextValue < propertyConfig.min) ||
        (propertyConfig.max !== undefined && nextValue > propertyConfig.max)))
  ) {
    return;
  }

  keyframe.value = nextValue;
  commitSelectedKeyframeChange(state);
};

export const setSelectedKeyframeRelative = ({ state }, { relative } = {}) => {
  const selectedKeyframe = state.selectedKeyframe;
  const keyframe = getMutableSelectedKeyframe(state);
  const keyframes =
    state.definition.tween?.[selectedKeyframe?.property]?.keyframes ?? [];
  const finalKeyframe = selectedKeyframe?.index === keyframes.length - 1;
  if (selectedKeyframe?.side !== "update" || !keyframe || finalKeyframe) {
    return;
  }

  if (relative === true) {
    keyframe.relative = true;
  } else {
    delete keyframe.relative;
  }
  commitSelectedKeyframeChange(state);
};

const getSelectedPropertyStartValueConfig = (state) => {
  const selectedProperty = state.selectedProperty;
  if (!selectedProperty) {
    return undefined;
  }

  const keyframe = getMutableKeyframes(state, selectedProperty)?.[0];
  if (!keyframe) {
    return undefined;
  }

  const property =
    selectedProperty.side === "update" ? selectedProperty.property : "volume";
  return {
    keyframe,
    propertyConfig: AUDIO_EFFECT_PROPERTY_CONFIG[property] ?? {},
  };
};

export const setSelectedPropertyStartValue = ({ state }, { value } = {}) => {
  const config = getSelectedPropertyStartValueConfig(state);
  const nextValue = Number(value);
  if (
    !config ||
    !Number.isFinite(nextValue) ||
    (config.propertyConfig.min !== undefined &&
      nextValue < config.propertyConfig.min) ||
    (config.propertyConfig.max !== undefined &&
      nextValue > config.propertyConfig.max)
  ) {
    return;
  }

  config.keyframe.startValue = nextValue;
  commitSelectedKeyframeChange(state);
};

export const setSelectedPropertyValueSource = (
  { state },
  { valueSource } = {},
) => {
  const config = getSelectedPropertyStartValueConfig(state);
  if (!config || (valueSource !== "default" && valueSource !== "fixed")) {
    return;
  }

  if (valueSource === "default") {
    if (config.keyframe.startValue === undefined) {
      return;
    }
    delete config.keyframe.startValue;
  } else {
    if (config.keyframe.startValue !== undefined) {
      return;
    }
    const side = state.selectedProperty.side;
    config.keyframe.startValue =
      side === "prev"
        ? 100
        : side === "next"
          ? 0
          : (config.propertyConfig.defaultValue ?? 0);
  }
  commitSelectedKeyframeChange(state);
};

export const selectKeyframeDialogValues = ({ state }) => {
  const { add, delay, duration, index, property, side } = state.keyframeDialog;
  const resolvedProperty = side === "update" ? property : "volume";
  if (add) {
    return {
      useStartValue: false,
      startValue:
        AUDIO_EFFECT_PROPERTY_CONFIG[resolvedProperty]?.defaultValue ?? 0,
      relative: false,
      value:
        side === "next"
          ? 50
          : (AUDIO_EFFECT_PROPERTY_CONFIG[resolvedProperty]?.defaultValue ?? 0),
      delay: delay ?? 0,
      duration: duration ?? 300,
      easing: "easeInOutSine",
    };
  }

  const keyframe =
    getMutableKeyframes(state, { side, property })?.[index] ?? {};
  return {
    useStartValue: keyframe.startValue !== undefined,
    startValue:
      keyframe.startValue ??
      AUDIO_EFFECT_PROPERTY_CONFIG[resolvedProperty]?.defaultValue ??
      0,
    relative: keyframe.relative === true,
    value:
      keyframe.value ??
      AUDIO_EFFECT_PROPERTY_CONFIG[resolvedProperty]?.defaultValue ??
      0,
    delay: keyframe.delay ?? 0,
    duration: keyframe.duration ?? 0,
    easing: keyframe.easing ?? "linear",
  };
};

const buildSelectedKeyframePanelData = (state, copy = {}) => {
  const selectedKeyframe = state.selectedKeyframe;
  const keyframe = getMutableSelectedKeyframe(state);
  if (!selectedKeyframe || !keyframe) {
    return undefined;
  }

  const { index, property, side } = selectedKeyframe;
  const updateKeyframe = side === "update";
  const keyframes = getMutableKeyframes(state, { side, property }) ?? [];
  const finalKeyframe = index === keyframes.length - 1;
  const propertyConfig = updateKeyframe
    ? (AUDIO_EFFECT_PROPERTY_CONFIG[property] ?? {})
    : AUDIO_EFFECT_PROPERTY_CONFIG.volume;
  const propertyLabel = updateKeyframe
    ? getPropertyLabel(property, copy)
    : (copy.fadePropertyLabel ?? "Fade");
  const timelineLabel =
    side === "prev"
      ? (copy.outgoingLabel ?? "Outgoing")
      : side === "next"
        ? (copy.incomingLabel ?? "Incoming")
        : (copy.updateType ?? "Update");
  const lockedIncomingEndpoint =
    side === "next" && property === "fade" && finalKeyframe;
  const fields = [
    {
      type: "text",
      label: copy.timelineLabel ?? "Timeline",
      value: timelineLabel,
    },
    {
      type: "text",
      label: copy.propertyLabel ?? "Property",
      value: propertyLabel,
    },
  ];
  if (updateKeyframe) {
    fields.push({
      type: "text",
      label: copy.startValueLabel ?? "Start value",
      value:
        keyframe.startValue === undefined
          ? (copy.currentValueOption ?? "Current value")
          : `${keyframe.startValue}`,
    });
  }
  fields.push(
    {
      type: "slot",
      label: copy.delayMsLabel ?? "Delay (ms)",
      slot: "keyframe-delay",
    },
    {
      type: "slot",
      label: copy.durationMsLabel ?? "Duration (ms)",
      slot: "keyframe-duration",
    },
    {
      type: "slot",
      label: copy.easingLabel ?? "Easing",
      slot: "keyframe-easing",
    },
  );
  fields.push({
    type: "slot",
    label: copy.valueLabel ?? "Value",
    slot: "keyframe-value",
  });
  if (updateKeyframe && !finalKeyframe) {
    fields.push({
      type: "slot",
      label: copy.valueTypeLabel ?? "Value type",
      slot: "keyframe-value-type",
    });
  }

  return {
    id: `${side}:${property}:${index}`,
    canOpenEditDialog: updateKeyframe,
    editor: {
      delay: keyframe.delay ?? 0,
      delayLabel: copy.delayMsLabel ?? "Delay (ms)",
      duration: keyframe.duration,
      durationLabel: copy.durationMsLabel ?? "Duration (ms)",
      easing: keyframe.easing ?? "linear",
      easingOptions: createEasingOptions(),
      relative: keyframe.relative === true,
      relativeOptions: [
        { label: copy.absoluteValueType ?? "Absolute", value: false },
        { label: copy.relativeValueType ?? "Relative", value: true },
      ],
      value: keyframe.value,
      valueDisabled: lockedIncomingEndpoint,
      valueEditable: !lockedIncomingEndpoint,
      valueStep: propertyConfig.step ?? 0.01,
      valueSlider:
        propertyConfig.max === undefined
          ? undefined
          : {
              min: propertyConfig.min,
              max: propertyConfig.max,
              step: propertyConfig.step,
            },
    },
    fields,
  };
};

const buildSelectedPropertyPanelData = (state, copy = {}) => {
  const selectedProperty = state.selectedProperty;
  const config = getSelectedPropertyStartValueConfig(state);
  if (!selectedProperty || !config) {
    return undefined;
  }

  const { property, side } = selectedProperty;
  const updateProperty = side === "update";
  const propertyLabel = updateProperty
    ? getPropertyLabel(property, copy)
    : (copy.fadePropertyLabel ?? "Fade");
  const timelineLabel =
    side === "prev"
      ? (copy.outgoingLabel ?? "Outgoing")
      : side === "next"
        ? (copy.incomingLabel ?? "Incoming")
        : (copy.updateType ?? "Update");
  const hasStartValue = config.keyframe.startValue !== undefined;
  const defaultStartValue =
    side === "prev"
      ? 100
      : side === "next"
        ? 0
        : (config.propertyConfig.defaultValue ?? 0);
  const fields = [
    {
      type: "text",
      label: copy.timelineLabel ?? "Timeline",
      value: timelineLabel,
    },
    {
      type: "text",
      label: copy.propertyLabel ?? "Property",
      value: propertyLabel,
    },
    {
      type: "slot",
      label: copy.valueSourceLabel ?? "Value source",
      slot: "property-value-source",
    },
  ];
  if (hasStartValue) {
    fields.push({
      type: "slot",
      label: copy.startValueLabel ?? "Start value",
      slot: "property-start-value",
    });
  }

  return {
    id: `${side}:${property}`,
    fields,
    editor: {
      valueSource: hasStartValue ? "fixed" : "default",
      valueSourceOptions: [
        {
          label: copy.defaultValueOption ?? "Default",
          value: "default",
        },
        {
          label: copy.fixedValueOption ?? "Fixed",
          value: "fixed",
        },
      ],
      startValue: hasStartValue
        ? config.keyframe.startValue
        : defaultStartValue,
      startValueSlider:
        config.propertyConfig.max === undefined
          ? undefined
          : {
              min: config.propertyConfig.min,
              max: config.propertyConfig.max,
              step: config.propertyConfig.step,
            },
      startValueStep: config.propertyConfig.step ?? 0.01,
    },
  };
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectAudioEffectsEditorPageCopy(i18n);
  const isTransition = state.definition.type === "transition";
  const tween = isTransition ? {} : state.definition.tween;
  const availableProperties = AUDIO_EFFECT_PROPERTY_KEYS.filter(
    (property) => !tween[property],
  );
  const dialogProperty = state.keyframeDialog.property;
  const dialogSide = state.keyframeDialog.side;
  const dialogKeyframes =
    getMutableKeyframes(state, {
      side: dialogSide,
      property: dialogProperty,
    }) ?? [];
  const finalKeyframe =
    !state.keyframeDialog.add &&
    state.keyframeDialog.index === dialogKeyframes.length - 1;
  const transitionDialog = dialogSide === "prev" || dialogSide === "next";
  const fixedDialogValue =
    finalKeyframe && dialogSide === "next" && dialogProperty === "fade"
      ? 100
      : undefined;

  const properties = Object.entries(tween).map(([property, config]) => ({
    id: property,
    label: getPropertyLabel(property, copy),
    canRemove: Object.keys(tween).length > 1,
    keyframes: config.keyframes.map((keyframe, index) => ({
      index,
      valueLabel: formatKeyframeValue(keyframe, copy),
      startValueLabel:
        keyframe.startValue === undefined
          ? (copy.currentValueOption ?? "Current value")
          : `${keyframe.startValue}`,
      timingLabel: `${keyframe.delay ?? 0}ms + ${keyframe.duration}ms`,
      easingLabel: formatEasingLabel(keyframe.easing ?? "linear"),
      canDelete: index < config.keyframes.length - 1,
    })),
  }));
  const updateTimelineProperties = createUpdateTimelineProperties(tween, copy);
  const previousTimelineProperties = createFadeTimelineProperties({
    definition: state.definition,
    side: "prev",
    copy,
  });
  const nextTimelineProperties = createFadeTimelineProperties({
    definition: state.definition,
    side: "next",
    copy,
  });
  const usedDuration = getAudioEffectDefinitionDuration(state.definition);
  const selectedProperty = state.selectedProperty;
  const selectedKeyframePanel =
    state.selectedEditorTab === "timeline"
      ? buildSelectedKeyframePanelData(state, copy)
      : undefined;
  const selectedPropertyPanel =
    state.selectedEditorTab === "timeline"
      ? buildSelectedPropertyPanelData(state, copy)
      : undefined;
  const preview = selectAudioEffectPreview({ state });
  const previewSoundItems = isTransition
    ? [
        {
          target: "outgoing",
          label: copy.outgoingSoundLabel ?? "Outgoing Sound",
          sound: preview.outgoingSound,
        },
        {
          target: "incoming",
          label: copy.incomingSoundLabel ?? "Incoming Sound",
          sound: preview.incomingSound,
        },
      ]
    : [
        {
          target: "target",
          label: copy.previewSoundLabel ?? "Preview Sound",
          sound: preview.targetSound,
        },
      ];
  const transitionSoundsValid = Boolean(
    preview.outgoingSound &&
      preview.incomingSound &&
      preview.outgoingSound.id !== preview.incomingSound.id,
  );
  const previewReady = isTransition
    ? transitionSoundsValid
    : Boolean(preview.targetSound);
  const timelinePixelsPerSecond = Math.round(
    TIMELINE_BASE_PIXELS_PER_SECOND * state.timelineZoom,
  );
  const timelineViewportContentWidth = Math.max(
    0,
    (state.timelineViewportWidth ?? 0) - TIMELINE_VIEWPORT_PADDING,
  );
  const viewportTimelineDuration =
    timelineViewportContentWidth > TIMELINE_PROPERTY_COLUMN_WIDTH
      ? ((timelineViewportContentWidth - TIMELINE_PROPERTY_COLUMN_WIDTH) /
          timelinePixelsPerSecond) *
        1000
      : 0;
  const timelineDisplayDuration = Math.max(
    state.timelineDuration,
    viewportTimelineDuration,
  );
  const timelineCanvasWidth = Math.round(
    TIMELINE_PROPERTY_COLUMN_WIDTH +
      (timelineDisplayDuration / 1000) * timelinePixelsPerSecond,
  );
  const timelinePlayheadTimeMs = Number(state.previewPlayheadTimeMs);
  const timelinePlayheadRatio =
    timelineDisplayDuration > 0 && Number.isFinite(timelinePlayheadTimeMs)
      ? Math.min(
          1,
          Math.max(0, timelinePlayheadTimeMs / timelineDisplayDuration),
        )
      : 0;
  const timelinePlayheadVisible =
    state.previewPlayheadVisible && usedDuration > 0;
  const timelineUsedAreaRatio =
    timelineDisplayDuration > 0
      ? Math.min(1, usedDuration / timelineDisplayDuration)
      : 0;
  const timelineUsedAreaStyle = `top: 0; bottom: 0; left: 104px; width: calc((100% - 104px) * ${timelineUsedAreaRatio}); pointer-events: none; z-index: 0;`;
  const timelinePlayheadStyle = timelinePlayheadVisible
    ? `top: 10px; bottom: 0; left: calc(104px + (100% - 104px) * ${timelinePlayheadRatio}); width: 1px; transform: translateX(-0.5px); pointer-events: none; z-index: 8;`
    : "";
  const selectedPreviewSoundId = state.previewSoundSelector.selectedSoundId;
  const keyframeMenuKeyframes = getMutableKeyframes(state, state.keyframeMenu);
  const keyframeMenuFinal =
    state.keyframeMenu.index === keyframeMenuKeyframes?.length - 1;
  const keyframeMenuProtectedEndpoint =
    keyframeMenuFinal &&
    (state.keyframeMenu.side === "update" ||
      (state.keyframeMenu.side === "next" &&
        state.keyframeMenu.property === "fade"));
  const keyframeMenuItems = AUDIO_EFFECT_KEYFRAME_MENU_ITEMS.filter(
    (item) =>
      item.value !== "delete-keyframe" ||
      (keyframeMenuKeyframes?.length > 1 && !keyframeMenuProtectedEndpoint),
  ).map((item) => {
    const labels = {
      edit: copy.editKeyframeMenuItem ?? "Edit keyframe",
      "add-right": copy.addKeyframeRightMenuItem ?? "Add keyframe to right",
      "add-left": copy.addKeyframeLeftMenuItem ?? "Add keyframe to left",
      "delete-keyframe": copy.deleteKeyframeMenuItem ?? "Delete keyframe",
    };
    return {
      ...item,
      label: labels[item.value],
    };
  });

  return {
    resourceCategory: "animatedAssets",
    selectedResourceId: "audio-effects-editor",
    showExplorerPanel: !state.isTouchMode,
    audioEffectName: state.audioEffectName,
    effectTypeLabel: isTransition
      ? (copy.transitionType ?? "Transition")
      : (copy.updateType ?? "Update"),
    isTransition,
    isUpdate: !isTransition,
    selectedEditorTab: state.selectedEditorTab,
    editorTabs: [
      {
        id: "timeline",
        label: copy.timelineLabel ?? "Timeline",
        panelId: "audioEffectTimelinePanel",
      },
      {
        id: "preview",
        label: copy.previewTitle ?? "Preview",
        panelId: "audioEffectPreviewPanel",
      },
    ].map((item) => {
      const selected = item.id === state.selectedEditorTab;
      return {
        ...item,
        selected,
        tabIndex: selected ? 0 : -1,
        backgroundColor: selected ? "ac" : "",
        borderColor: selected ? "" : "tr",
        textColor: selected ? "fg" : "mu-fg",
      };
    }),
    editorPanelsLabel: copy.editorPanelsLabel ?? "Audio effect editor panels",
    properties,
    updateTimelineProperties,
    updateTimelineDefaultValues: TIMELINE_DEFAULT_VALUES,
    previousTimelineProperties,
    previousTimelineDefaultValues: { fade: 100 },
    nextTimelineProperties,
    nextTimelineDefaultValues: { fade: 0 },
    previousTimelineVisible: Object.keys(previousTimelineProperties).length > 0,
    nextTimelineVisible: Object.keys(nextTimelineProperties).length > 0,
    timelineDuration: timelineDisplayDuration,
    timelineUsedDuration: usedDuration,
    previewPlayheadTimeMs: state.previewPlayheadTimeMs,
    timelinePlayheadVisible,
    timelinePlayheadStyle,
    timelineUsedAreaStyle,
    timelineCanvasStyle: `width: ${timelineCanvasWidth}px; min-width: 100%; flex-shrink: 0;`,
    timelineZoom: state.timelineZoom,
    timelineZoomMin: TIMELINE_ZOOM_MIN,
    timelineZoomMax: TIMELINE_ZOOM_MAX,
    timelineZoomStep: TIMELINE_ZOOM_STEP,
    timelineZoomLabel: copy.timelineZoomLabel ?? "Timeline zoom",
    timelineZoomInLabel: copy.timelineZoomInLabel ?? "Zoom timeline in",
    timelineZoomOutLabel: copy.timelineZoomOutLabel ?? "Zoom timeline out",
    selectedKeyframe: state.selectedKeyframe,
    selectedProperty,
    keyframeMenu: state.keyframeMenu,
    keyframeMenuItems,
    showRightPanel: !state.isTouchMode,
    detailsPanelTitle: selectedKeyframePanel
      ? (copy.keyframeDetailsTitle ?? "Keyframe Details")
      : selectedPropertyPanel
        ? (copy.propertyLabel ?? "Property")
        : undefined,
    selectedKeyframeDetailId: selectedKeyframePanel?.id,
    selectedKeyframeDetailFields: selectedKeyframePanel?.fields ?? [],
    selectedKeyframeEditor: selectedKeyframePanel?.editor,
    selectedPropertyDetailId: selectedPropertyPanel?.id,
    selectedPropertyDetailFields: selectedPropertyPanel?.fields ?? [],
    selectedPropertyEditor: selectedPropertyPanel?.editor,
    selectedKeyframeCanOpenEditDialog:
      selectedKeyframePanel?.canOpenEditDialog === true,
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
    editKeyframeButtonLabel: copy.editKeyframeTitle ?? "Edit Keyframe",
    canRemoveSelectedProperty:
      selectedProperty !== undefined && Object.keys(tween).length > 1,
    previousTimelineLabel: copy.outgoingLabel ?? "Outgoing",
    nextTimelineLabel: copy.incomingLabel ?? "Incoming",
    canAddProperty: availableProperties.length > 0,
    addPropertyButton: copy.addPropertyButton ?? "Add Property",
    addKeyframeButton: copy.addKeyframeButton ?? "Add Keyframe",
    removePropertyButton: copy.removePropertyButton ?? "Remove Property",
    editButton: copy.editMenuItem ?? "Edit",
    deleteButton: copy.deleteMenuItem ?? "Delete",
    saving: state.saving,
    saveButton: copy.saveButton ?? "Save",
    previewSoundItems,
    previewSoundSelectorOpen: state.previewSoundSelector.open,
    selectedPreviewSoundId,
    soundSelectionConfirmDisabled: !selectedPreviewSoundId,
    confirmSoundSelectionButton: copy.confirmSoundSelectionButton ?? "Select",
    selectSoundLabel: copy.selectSoundLabel ?? "Select Sound",
    playButton: state.previewPlaying
      ? (copy.stopPreviewButton ?? "Stop Preview")
      : (copy.playButton ?? "Play"),
    playButtonDisabled: !previewReady || state.previewLoading,
    loopPreviewLabel: copy.loopPreviewLabel ?? "Loop preview",
    previewLoopButtonVariant: state.previewLoopEnabled ? "pr" : "ol",
    previewLoopEnabled: state.previewLoopEnabled,
    previewPlaying: state.previewPlaying,
    previewLoading: state.previewLoading,
    emptyUpdateMessage:
      copy.emptyUpdateMessage ?? "Add a property to configure this effect.",
    addPropertyDialogOpen: state.addPropertyDialogOpen,
    addPropertyForm: createAddPropertyForm(availableProperties, copy),
    addPropertyFormDefaults: {
      property: availableProperties[0],
    },
    keyframeDialogOpen: state.keyframeDialog.open,
    keyframeDialogKey: `${dialogSide ?? ""}:${dialogProperty ?? ""}:${state.keyframeDialog.index ?? "add"}:${state.keyframeDialog.add}`,
    keyframeForm: createKeyframeForm({
      add: state.keyframeDialog.add,
      fixedValue: fixedDialogValue,
      finalKeyframe,
      property: transitionDialog ? "volume" : dialogProperty,
      transitionKeyframe: transitionDialog,
      copy,
    }),
    keyframeFormDefaults: selectKeyframeDialogValues({ state }),
  };
};
