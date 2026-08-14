import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  getAudioEffectDefinitionDuration,
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

const createDefaultKeyframe = (property, { side = "update" } = {}) => {
  const keyframe = {
    value: AUDIO_EFFECT_PROPERTY_CONFIG[property]?.defaultValue ?? 0,
    duration: 300,
    easing: "easeInOutSine",
  };
  if (side === "prev" && property === "volume") {
    keyframe.value = 0;
  }
  return keyframe;
};

const createDefaultPropertyTrack = (property, { side = "update" } = {}) => {
  const track = {
    keyframes: [createDefaultKeyframe(property, { side })],
  };
  if (side === "next" && property === "volume") {
    track.initialValue = 0;
  }
  return track;
};

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
      keyframes: [createDefaultKeyframe("volume")],
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
  finalKeyframe = false,
  property,
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

  if (!finalKeyframe) {
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

const createTimelineProperties = (tracks = {}, copy = {}) =>
  Object.fromEntries(
    Object.entries(tracks).map(([property, config]) => [
      property,
      {
        ...cloneDefinition(config),
        label: getPropertyLabel(property, copy),
        initialValue: config.initialValue,
        keyframes: createTimelineKeyframes(config.keyframes),
      },
    ]),
  );

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
  playButtonTooltip: {
    open: false,
    x: 0,
    y: 0,
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
  selectedKeyframeAddMenu: {
    open: false,
    x: undefined,
    y: undefined,
  },
  keyframeMenu: {
    open: false,
    x: undefined,
    y: undefined,
    side: undefined,
    property: undefined,
    index: undefined,
  },
  addPropertyDialogOpen: false,
  addPropertySide: "update",
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
  state.playButtonTooltip.open = false;
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
  state.selectedKeyframeAddMenu.open = false;
  state.selectedKeyframeAddMenu.x = undefined;
  state.selectedKeyframeAddMenu.y = undefined;
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
export const selectSelectedKeyframeAddMenu = ({ state }) =>
  state.selectedKeyframeAddMenu;
export const selectIsTouchMode = ({ state }) => state.isTouchMode;
export const selectKeyframeMenu = ({ state }) => state.keyframeMenu;
export const selectDefaultSelectedKeyframeStartValue = ({ state }) => {
  const selectedKeyframe = state.selectedKeyframe;
  if (!selectedKeyframe) {
    return 0;
  }

  const { index, property, side } = selectedKeyframe;
  const keyframes = getMutableKeyframes(state, selectedKeyframe) ?? [];
  const selectedFrame = keyframes[index];
  if (!selectedFrame || selectedFrame.relative) {
    return 0;
  }

  const propertyInitialValue = getMutablePropertyConfig(state, {
    side,
    property,
  })?.initialValue;
  let currentValue = Number(propertyInitialValue);
  if (!Number.isFinite(currentValue)) {
    currentValue = AUDIO_EFFECT_PROPERTY_CONFIG[property]?.defaultValue ?? 0;
  }

  for (const keyframe of keyframes.slice(0, index)) {
    const value = Number(keyframe.value);
    if (!Number.isFinite(value)) {
      continue;
    }
    currentValue = keyframe.relative ? currentValue + value : value;
  }

  return currentValue;
};
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
  state.playButtonTooltip.open = false;
  closePreviewSoundSelector({ state });
};

export const showPlayButtonTooltip = ({ state }, { x, y } = {}) => {
  state.playButtonTooltip.open = true;
  state.playButtonTooltip.x = x;
  state.playButtonTooltip.y = y;
};

export const hidePlayButtonTooltip = ({ state }) => {
  state.playButtonTooltip.open = false;
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

const getMutablePropertyTracks = (state, side = "update") => {
  if (side === "update") {
    return state.definition.type === "update"
      ? state.definition.tween
      : undefined;
  }
  if (
    state.definition.type === "transition" &&
    (side === "prev" || side === "next")
  ) {
    return state.definition[side];
  }
  return undefined;
};

const getMutablePropertyConfig = (state, { side = "update", property } = {}) =>
  getMutablePropertyTracks(state, side)?.[property];

const getMutableKeyframes = (state, selectedProperty = {}) =>
  getMutablePropertyConfig(state, selectedProperty)?.keyframes;

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
  state.selectedKeyframeAddMenu.open = false;
};

export const setSelectedProperty = (
  { state },
  { side = "update", property } = {},
) => {
  const propertyExists =
    getMutableKeyframes(state, { side, property }) !== undefined;
  state.selectedProperty = propertyExists ? { side, property } : undefined;
  state.selectedKeyframe = undefined;
  state.selectedKeyframeAddMenu.open = false;
};

export const openSelectedKeyframeAddMenu = ({ state }, { x, y } = {}) => {
  state.selectedKeyframeAddMenu.open = true;
  state.selectedKeyframeAddMenu.x = x;
  state.selectedKeyframeAddMenu.y = y;
};

export const closeSelectedKeyframeAddMenu = ({ state }) => {
  state.selectedKeyframeAddMenu.open = false;
  state.selectedKeyframeAddMenu.x = undefined;
  state.selectedKeyframeAddMenu.y = undefined;
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

export const openAddPropertyDialog = ({ state }, { side = "update" } = {}) => {
  const validSide =
    state.definition.type === "transition"
      ? side === "prev" || side === "next"
      : side === "update";
  if (!validSide) {
    return;
  }
  state.addPropertySide = side;
  state.addPropertyDialogOpen = true;
};

export const closeAddPropertyDialog = ({ state }) => {
  state.addPropertyDialogOpen = false;
};

export const selectAddPropertySide = ({ state }) => state.addPropertySide;

export const addAudioEffectProperty = (
  { state },
  { property, side = state.addPropertySide } = {},
) => {
  const validSide =
    state.definition.type === "transition"
      ? side === "prev" || side === "next"
      : side === "update";
  if (!validSide || !AUDIO_EFFECT_PROPERTY_KEYS.includes(property)) {
    return;
  }

  let tracks = getMutablePropertyTracks(state, side);
  if (!tracks && state.definition.type === "transition") {
    state.definition[side] = {};
    tracks = state.definition[side];
  }
  if (!tracks || tracks[property]) {
    return;
  }

  tracks[property] = createDefaultPropertyTrack(property, { side });
  state.selectedProperty = { side, property };
  state.selectedKeyframe = undefined;
  state.addPropertyDialogOpen = false;
  state.dirty = true;
};

const countAudioEffectProperties = (definition) =>
  definition.type === "transition"
    ? ["prev", "next"].reduce(
        (count, side) => count + Object.keys(definition[side] ?? {}).length,
        0,
      )
    : Object.keys(definition.tween ?? {}).length;

export const removeAudioEffectProperty = (
  { state },
  { property, side = "update" } = {},
) => {
  const tracks = getMutablePropertyTracks(state, side);
  if (
    !tracks?.[property] ||
    countAudioEffectProperties(state.definition) <= 1
  ) {
    return;
  }

  delete tracks[property];
  if (side !== "update" && Object.keys(tracks).length === 0) {
    delete state.definition[side];
  }
  if (
    state.selectedProperty?.side === side &&
    state.selectedProperty.property === property
  ) {
    state.selectedProperty = undefined;
  }
  if (
    state.selectedKeyframe?.side === side &&
    state.selectedKeyframe.property === property
  ) {
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
  const insertionIndex = Math.min(
    Math.max(0, requestedIndex),
    keyframes.length,
  );
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
  const finalKeyframe = !add && index === keyframes.length - 1;
  if (finalKeyframe) {
    delete nextKeyframe.relative;
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
  const protectedEndpoint = finalKeyframe;
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
  const propertyConfig =
    AUDIO_EFFECT_PROPERTY_CONFIG[selectedKeyframe?.property] ?? {};
  if (
    !keyframe ||
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

export const setSelectedKeyframeStartValue = (
  { state },
  { startValue } = {},
) => {
  const selectedKeyframe = state.selectedKeyframe;
  const keyframe = getMutableSelectedKeyframe(state);
  if (!selectedKeyframe || !keyframe) {
    return;
  }

  if (startValue === undefined || startValue === "") {
    delete keyframe.startValue;
    commitSelectedKeyframeChange(state);
    return;
  }

  const propertyConfig =
    AUDIO_EFFECT_PROPERTY_CONFIG[selectedKeyframe.property] ?? {};
  const nextStartValue = Number(startValue);
  if (
    !Number.isFinite(nextStartValue) ||
    (!keyframe.relative &&
      ((propertyConfig.min !== undefined &&
        nextStartValue < propertyConfig.min) ||
        (propertyConfig.max !== undefined &&
          nextStartValue > propertyConfig.max)))
  ) {
    return;
  }

  keyframe.startValue = nextStartValue;
  commitSelectedKeyframeChange(state);
};

export const setSelectedKeyframeRelative = ({ state }, { relative } = {}) => {
  const selectedKeyframe = state.selectedKeyframe;
  const keyframe = getMutableSelectedKeyframe(state);
  const keyframes = getMutableKeyframes(state, selectedKeyframe) ?? [];
  const finalKeyframe = selectedKeyframe?.index === keyframes.length - 1;
  if (!selectedKeyframe || !keyframe || finalKeyframe) {
    return;
  }

  if (relative === true) {
    keyframe.relative = true;
  } else {
    delete keyframe.relative;
  }
  commitSelectedKeyframeChange(state);
};

const getSelectedPropertyInitialValueConfig = (state) => {
  const selectedProperty = state.selectedProperty;
  if (!selectedProperty) {
    return undefined;
  }

  const definition = getMutablePropertyConfig(state, selectedProperty);
  if (!definition) {
    return undefined;
  }

  return {
    definition,
    propertyConfig:
      AUDIO_EFFECT_PROPERTY_CONFIG[selectedProperty.property] ?? {},
  };
};

export const setSelectedPropertyInitialValue = (
  { state },
  { initialValue } = {},
) => {
  const config = getSelectedPropertyInitialValueConfig(state);
  if (!config) {
    return;
  }

  if (initialValue === undefined || initialValue === "") {
    if (config.definition.initialValue === undefined) {
      return;
    }
    delete config.definition.initialValue;
    state.dirty = true;
    return;
  }

  const nextValue = Number(initialValue);
  if (
    !Number.isFinite(nextValue) ||
    (config.propertyConfig.min !== undefined &&
      nextValue < config.propertyConfig.min) ||
    (config.propertyConfig.max !== undefined &&
      nextValue > config.propertyConfig.max)
  ) {
    return;
  }

  config.definition.initialValue = nextValue;
  state.dirty = true;
};

export const setSelectedPropertyValueSource = (
  { state },
  { valueSource } = {},
) => {
  const config = getSelectedPropertyInitialValueConfig(state);
  if (!config || (valueSource !== "default" && valueSource !== "fixed")) {
    return;
  }

  if (valueSource === "default") {
    setSelectedPropertyInitialValue({ state }, { initialValue: undefined });
    return;
  }
  if (config.definition.initialValue !== undefined) {
    return;
  }

  const initialValue = config.propertyConfig.defaultValue ?? 0;
  setSelectedPropertyInitialValue({ state }, { initialValue });
};

export const selectKeyframeDialogValues = ({ state }) => {
  const { add, delay, duration, index, property, side } = state.keyframeDialog;
  if (add) {
    return {
      useStartValue: false,
      startValue: AUDIO_EFFECT_PROPERTY_CONFIG[property]?.defaultValue ?? 0,
      relative: false,
      value: AUDIO_EFFECT_PROPERTY_CONFIG[property]?.defaultValue ?? 0,
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
      AUDIO_EFFECT_PROPERTY_CONFIG[property]?.defaultValue ??
      0,
    relative: keyframe.relative === true,
    value:
      keyframe.value ??
      AUDIO_EFFECT_PROPERTY_CONFIG[property]?.defaultValue ??
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
  const keyframes = getMutableKeyframes(state, { side, property }) ?? [];
  const finalKeyframe = index === keyframes.length - 1;
  const propertyConfig = AUDIO_EFFECT_PROPERTY_CONFIG[property] ?? {};
  const propertyLabel = getPropertyLabel(property, copy);
  const timelineLabel =
    side === "prev"
      ? (copy.outgoingLabel ?? "Outgoing")
      : side === "next"
        ? (copy.incomingLabel ?? "Incoming")
        : (copy.updateType ?? "Update");
  const hasStartValue = keyframe.startValue !== undefined;
  const valueSlider =
    propertyConfig.max === undefined
      ? undefined
      : {
          min: propertyConfig.min,
          max: propertyConfig.max,
          step: propertyConfig.step,
        };
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
  if (hasStartValue) {
    fields.push({
      type: "slot",
      slot: "keyframe-start-value",
    });
  }
  fields.push({
    type: "slot",
    label: copy.valueLabel ?? "Value",
    slot: "keyframe-value",
  });
  if (!finalKeyframe) {
    fields.push({
      type: "slot",
      label: copy.valueTypeLabel ?? "Value type",
      slot: "keyframe-value-type",
    });
  }

  return {
    id: `${side}:${property}:${index}`,
    canOpenEditDialog: true,
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
      hasStartValue,
      startValue: keyframe.startValue,
      startValueLabel: copy.startValueLabel ?? "Start value",
      startValueSlider: keyframe.relative === true ? undefined : valueSlider,
      value: keyframe.value,
      valueDisabled: false,
      valueEditable: true,
      valueStep: propertyConfig.step ?? 0.01,
      valueSlider,
    },
    fields,
  };
};

const buildSelectedPropertyPanelData = (state, copy = {}) => {
  const selectedProperty = state.selectedProperty;
  const config = getSelectedPropertyInitialValueConfig(state);
  if (!selectedProperty || !config) {
    return undefined;
  }

  const { property, side } = selectedProperty;
  const propertyLabel = getPropertyLabel(property, copy);
  const timelineLabel =
    side === "prev"
      ? (copy.outgoingLabel ?? "Outgoing")
      : side === "next"
        ? (copy.incomingLabel ?? "Incoming")
        : (copy.updateType ?? "Update");
  const hasInitialValue = config.definition.initialValue !== undefined;
  const defaultInitialValue = config.propertyConfig.defaultValue ?? 0;
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
  if (hasInitialValue) {
    fields.push({
      type: "slot",
      label: copy.initialValueLabel ?? "Initial value",
      slot: "property-initial-value",
    });
  }

  return {
    id: `${side}:${property}`,
    fields,
    editor: {
      hasInitialValue,
      initialValue: hasInitialValue
        ? config.definition.initialValue
        : defaultInitialValue,
      initialValueSlider:
        config.propertyConfig.max === undefined
          ? undefined
          : {
              min: config.propertyConfig.min,
              max: config.propertyConfig.max,
              step: config.propertyConfig.step,
            },
      initialValueStep: config.propertyConfig.step ?? 0.01,
      valueSource: hasInitialValue ? "fixed" : "default",
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
    },
  };
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectAudioEffectsEditorPageCopy(i18n);
  const isTransition = state.definition.type === "transition";
  const tween = isTransition ? {} : state.definition.tween;
  const addPropertySide = isTransition ? state.addPropertySide : "update";
  const addPropertyTracks = isTransition
    ? (state.definition[addPropertySide] ?? {})
    : tween;
  const availableProperties = AUDIO_EFFECT_PROPERTY_KEYS.filter(
    (property) => !addPropertyTracks[property],
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
  const updateTimelineProperties = createTimelineProperties(tween, copy);
  const previousTimelineProperties = createTimelineProperties(
    state.definition.prev,
    copy,
  );
  const nextTimelineProperties = createTimelineProperties(
    state.definition.next,
    copy,
  );
  const usedDuration = getAudioEffectDefinitionDuration(state.definition);
  const selectedProperty = state.selectedProperty;
  const propertyCount = countAudioEffectProperties(state.definition);
  const selectedKeyframePanel =
    state.selectedEditorTab === "timeline"
      ? buildSelectedKeyframePanelData(state, copy)
      : undefined;
  const selectedPropertyPanel =
    state.selectedEditorTab === "timeline"
      ? buildSelectedPropertyPanelData(state, copy)
      : undefined;
  const selectedKeyframeAddMenuItems =
    selectedKeyframePanel?.editor && !selectedKeyframePanel.editor.hasStartValue
      ? [
          {
            label: copy.startValueLabel ?? "Start value",
            type: "item",
            value: "start-value",
          },
        ]
      : [];
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
  const playButtonDisabledReason = previewReady
    ? undefined
    : isTransition
      ? (copy.selectTransitionPreviewSoundsToPlay ??
        "Select different outgoing and incoming sounds in Preview to enable playback.")
      : (copy.selectPreviewSoundToPlay ??
        "Select a preview sound in Preview to enable playback.");
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
  const keyframeMenuProtectedEndpoint = keyframeMenuFinal;
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
    previousTimelineDefaultValues: TIMELINE_DEFAULT_VALUES,
    nextTimelineProperties,
    nextTimelineDefaultValues: TIMELINE_DEFAULT_VALUES,
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
    selectedKeyframeAddMenu: state.selectedKeyframeAddMenu,
    selectedKeyframeAddMenuItems,
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
    addButton: copy.addButton ?? "Add",
    removeStartValueButtonLabel:
      copy.removeStartValueButtonLabel ?? "Remove start value",
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
    editKeyframeButtonLabel: copy.editKeyframeTitle ?? "Edit Keyframe",
    canRemoveSelectedProperty:
      selectedProperty !== undefined && propertyCount > 1,
    outgoingTimelineLabel: copy.outgoingLabel ?? "Outgoing",
    incomingTimelineLabel: copy.incomingLabel ?? "Incoming",
    canAddProperty: availableProperties.length > 0,
    canAddPreviousProperty:
      Object.keys(state.definition.prev ?? {}).length <
      AUDIO_EFFECT_PROPERTY_KEYS.length,
    canAddNextProperty:
      Object.keys(state.definition.next ?? {}).length <
      AUDIO_EFFECT_PROPERTY_KEYS.length,
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
    playButtonDisabledReason,
    playButtonTooltip: {
      open:
        playButtonDisabledReason !== undefined && state.playButtonTooltip.open,
      x: state.playButtonTooltip.x,
      y: state.playButtonTooltip.y,
    },
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
      finalKeyframe,
      property: dialogProperty,
      copy,
    }),
    keyframeFormDefaults: selectKeyframeDialogValues({ state }),
  };
};
