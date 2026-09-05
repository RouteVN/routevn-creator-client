import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  connectAudioSoundToPrevious,
  createAudioTimelineLayout,
  createAudioTimelineSnapStartDelays,
  formatAudioDurationMs,
  normalizeAudioChannelInterruption,
  normalizeAudioStartDelayMs,
  resolveAudioInsertionTiming,
  resolveDraggedAudioStartDelayMs,
  sortAudioSoundsByStartDelay,
} from "../../internal/audioTimeline.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";
import { createCommandLineResourceSelectorLayout } from "../../internal/ui/sceneEditor/commandLineResourceSelectorLayout.js";
import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";

const DEFAULT_CHANNEL_VOLUME = 75;
const DEFAULT_SOUND_VOLUME = 100;
const DEFAULT_AUDIO_EFFECT_PLAYBACK_SPEED = 1;

const normalizeVolume = (volume, fallback) => {
  const parsedVolume = Number(volume);
  if (!Number.isFinite(parsedVolume)) {
    return fallback;
  }

  const nextVolume = parsedVolume > 100 ? parsedVolume / 10 : parsedVolume;
  return Math.max(0, Math.min(100, Math.round(nextVolume)));
};

const normalizeAudioEffectPlaybackSpeed = (speed) => {
  const parsedSpeed = Number(speed);
  if (!Number.isFinite(parsedSpeed) || parsedSpeed <= 0) {
    return DEFAULT_AUDIO_EFFECT_PLAYBACK_SPEED;
  }
  return parsedSpeed;
};

const normalizeAudioEffectSelection = (selection) => {
  if (!selection?.resourceId) {
    return undefined;
  }

  const normalizedSelection = {
    resourceId: selection.resourceId,
  };
  if (selection.playback?.speed !== undefined) {
    normalizedSelection.playback = {
      speed: normalizeAudioEffectPlaybackSpeed(selection.playback.speed),
    };
  }
  return normalizedSelection;
};

const normalizeSounds = (sounds = []) => {
  const usedIds = new Set();
  return sounds.map((sound, index) => {
    const fallbackId = sound.resourceId ?? `sound-${index + 1}`;
    const baseId = sound.id ?? fallbackId;
    let id = baseId;
    let duplicateIndex = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${duplicateIndex}`;
      duplicateIndex += 1;
    }
    usedIds.add(id);

    const normalizedSound = {
      id,
      resourceId: sound.resourceId,
      loop: sound.loop ?? false,
      volume: normalizeVolume(sound.volume, DEFAULT_SOUND_VOLUME),
      startDelayMs: normalizeAudioStartDelayMs(sound.startDelayMs),
    };
    for (const field of ["muted", "pan", "playbackRate", "startAt", "endAt"]) {
      if (sound[field] !== undefined) {
        normalizedSound[field] = sound[field];
      }
    }
    for (const field of ["beginEffect", "endEffect"]) {
      const effect = normalizeAudioEffectSelection(sound[field]);
      if (effect) {
        normalizedSound[field] = effect;
      }
    }
    return normalizedSound;
  });
};

const syncBgmChannelLoop = (bgm) => {
  bgm.loop = !bgm.sounds.some((sound) => sound.loop);
};

const normalizeBgm = (bgm = {}) => {
  const normalizedBgm = {
    interruption: normalizeAudioChannelInterruption(bgm.interruption),
    loop: bgm.loop ?? true,
    volume: normalizeVolume(bgm.volume, DEFAULT_CHANNEL_VOLUME),
    sounds: [],
  };

  if (Array.isArray(bgm.sounds)) {
    normalizedBgm.sounds = normalizeSounds(bgm.sounds);
  } else if (bgm.resourceId !== undefined) {
    normalizedBgm.sounds = normalizeSounds([
      {
        id: bgm.resourceId,
        resourceId: bgm.resourceId,
        volume: DEFAULT_SOUND_VOLUME,
        startDelayMs: bgm.startDelayMs,
      },
    ]);
  }

  if (normalizedBgm.loop) {
    normalizedBgm.sounds.forEach((sound) => {
      sound.loop = false;
    });
  }

  const audioEffects = normalizeAudioEffectSelection(bgm.audioEffects);
  if (audioEffects) {
    normalizedBgm.audioEffects = audioEffects;
  }

  sortAudioSoundsByStartDelay(normalizedBgm.sounds);
  return normalizedBgm;
};

const createAudioEffectOptions = ({
  items,
  selectedResourceId,
  allowedTypes,
  copy,
}) => {
  const options = toFlatItems(items)
    .filter(
      (item) =>
        item.type === "audioEffect" &&
        allowedTypes.includes(item.audioEffect?.type),
    )
    .map((item) => ({
      value: item.id,
      label: item.name,
      suffixText: localizeCommandLineText(
        item.audioEffect?.type === "transition" ? "Transition" : "Update",
        copy,
      ),
    }));

  if (
    selectedResourceId &&
    !options.some((option) => option.value === selectedResourceId)
  ) {
    options.unshift({
      value: selectedResourceId,
      label: `Missing audio effect (${selectedResourceId})`,
    });
  }

  return options;
};

const createChannelForm = ({ audioEffects, items, copy }) => ({
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "interruption",
          description: "Interruption",
          type: "segmented-control",
          options: [
            { value: "immediate", label: "Immediate" },
            { value: "loopEnd", label: "Loop End" },
          ],
        },
        {
          name: "volume",
          description: "Volume",
          type: "slider-with-input",
          min: 0,
          max: 100,
          step: 1,
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "audioEffectId",
          label: "Audio Effect",
          type: "select",
          clearable: true,
          placeholder: "Select audio effect",
          options: createAudioEffectOptions({
            items,
            selectedResourceId: audioEffects?.resourceId,
            allowedTypes: ["transition", "update"],
            copy,
          }),
        },
        {
          $when: "audioEffectId",
          name: "audioEffectPlaybackSpeed",
          label: "Playback Speed",
          type: "slider-with-input",
          min: 0.01,
          max: 4,
          step: 0.01,
          required: true,
        },
        {
          $when: "!audioEffectId",
          type: "slot",
          slot: "audioEffectPlaybackSpeedSpacer",
        },
      ],
    },
  ],
});

const createBoundaryEffectFields = ({ boundary, sound, items, copy }) => {
  const effectField = `${boundary}Effect`;
  const effectIdField = `${effectField}Id`;
  return {
    type: "row",
    fields: [
      {
        name: effectIdField,
        label: boundary === "begin" ? "Begin Effect" : "End Effect",
        type: "select",
        clearable: true,
        placeholder: "Select audio effect",
        options: createAudioEffectOptions({
          items,
          selectedResourceId: sound?.[effectField]?.resourceId,
          allowedTypes: ["update"],
          copy,
        }),
      },
      {
        $when: effectIdField,
        name: `${effectField}PlaybackSpeed`,
        label: "Playback Speed",
        type: "slider-with-input",
        min: 0.01,
        max: 4,
        step: 0.01,
        required: true,
      },
      {
        $when: `!${effectIdField}`,
        type: "slot",
        slot: `${effectField}PlaybackSpeedSpacer`,
      },
    ],
  };
};

const createSoundForm = ({ sound, items, copy }) => ({
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "startDelayMs",
          label: "Start Delay",
          type: "input-duration",
          min: 0,
          step: 10,
        },
        {
          type: "slot",
          slot: "startDelaySpacer",
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "loop",
          description: "Loop",
          type: "segmented-control",
          options: [
            { value: false, label: "Don't Loop" },
            { value: true, label: "Loop" },
          ],
        },
        {
          name: "volume",
          description: "Volume",
          type: "slider-with-input",
          min: 0,
          max: 100,
          step: 1,
        },
      ],
    },
    createBoundaryEffectFields({ boundary: "begin", sound, items, copy }),
    createBoundaryEffectFields({ boundary: "end", sound, items, copy }),
  ],
});

export const createInitialState = () => ({
  mode: "current",
  items: { items: {}, tree: [] },
  audioEffectItems: { items: {}, tree: [] },
  tempSelectedResourceId: undefined,
  pendingInsertIndex: 0,
  pendingReplacementSoundId: undefined,
  closeEditorAfterSoundSelection: false,
  channelSelected: false,
  isChannelEditorOpen: false,
  selectedSoundId: undefined,
  soundDrag: undefined,
  suppressChannelClickUntil: 0,
  bgm: normalizeBgm(),
  searchQuery: "",
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
  isTouchMode: false,
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

export const selectBgm = ({ state }) => state.bgm;

export const selectHasBgmSounds = ({ state }) => {
  return state.bgm.sounds.length > 0;
};

export const selectSelectedSoundId = ({ state }) => state.selectedSoundId;

export const selectIsChannelEditorOpen = ({ state }) => {
  return state.isChannelEditorOpen;
};

export const selectSoundDrag = ({ state }) => state.soundDrag;

export const selectShouldSuppressChannelClick = (
  { state },
  { eventTimeStamp } = {},
) => {
  return (
    Number.isFinite(eventTimeStamp) &&
    eventTimeStamp <= state.suppressChannelClickUntil
  );
};

export const selectSelectedSound = ({ state }) => {
  return state.bgm.sounds.find((sound) => sound.id === state.selectedSoundId);
};

export const selectPendingInsertIndex = ({ state }) => {
  return state.pendingInsertIndex;
};

export const selectPendingReplacementSoundId = ({ state }) => {
  return state.pendingReplacementSoundId;
};

export const selectCloseEditorAfterSoundSelection = ({ state }) => {
  return state.closeEditorAfterSoundSelection;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const selectSoundItemById = ({ state }, { itemId } = {}) => {
  return toFlatItems(state.items).find((item) => item.id === itemId);
};

export const selectBgmSoundById = ({ state }, { soundId } = {}) => {
  return state.bgm.sounds.find((sound) => sound.id === soundId);
};

export const selectBgmSoundIndexById = ({ state }, { soundId } = {}) => {
  return state.bgm.sounds.findIndex((sound) => sound.id === soundId);
};

export const selectBreadcrumb = ({ state }) => {
  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
  ];

  if (state.mode === "gallery") {
    breadcrumb.push({
      id: "current",
      label: "BGM",
      click: true,
    });
    breadcrumb.push({
      label: "Select",
    });
  } else {
    breadcrumb.push({
      label: "BGM",
    });
  }

  return breadcrumb;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const resourceSelectorLayout = createCommandLineResourceSelectorLayout({
    isTouchMode: state.isTouchMode,
  });
  const flatSoundItems = toFlatItems(state.items);
  const soundResourceById = new Map(
    flatSoundItems.map((item) => [item.id, item]),
  );
  const folderItems = flatSoundItems.filter((item) => item.type === "folder");
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };
  const groups = toFlatGroups(state.items)
    .map((group) => {
      const children = group.children.filter(matchesSearch).map((child) => {
        const isSelected = child.id === state.tempSelectedResourceId;
        return {
          ...child,
          itemBorderColor: isSelected ? "pr" : "bo",
          itemHoverBorderColor: isSelected ? "pr" : "ac",
          waveformDataFileId: child.waveformDataFileId,
        };
      });

      return {
        ...group,
        children,
        shouldDisplay: !searchQuery || children.length > 0,
      };
    })
    .filter((group) => group.shouldDisplay);

  const timeline = createAudioTimelineLayout({
    sounds: state.bgm.sounds,
    resourceById: soundResourceById,
  });
  const sounds = timeline.sounds.map((timelineSound) => {
    const { sound, durationMs } = timelineSound;
    const resource = soundResourceById.get(sound.resourceId);
    const isSelected =
      state.isChannelEditorOpen && sound.id === state.selectedSoundId;
    return {
      ...sound,
      name: resource?.name ?? sound.resourceId,
      fileId: resource?.fileId,
      waveformDataFileId: resource?.waveformDataFileId,
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
      durationLabel: formatAudioDurationMs(durationMs),
      leftPercent: timelineSound.leftPercent,
      widthPercent: timelineSound.widthPercent,
      topPx: timelineSound.topPx,
      insertBeforeIndex: timelineSound.sourceIndex,
      insertAfterIndex: timelineSound.sourceIndex + 1,
    };
  });
  const selectedSound = sounds.find(
    (sound) => sound.id === state.selectedSoundId,
  );
  const channelSelected =
    !state.isChannelEditorOpen &&
    state.channelSelected &&
    selectedSound === undefined;
  const hasSelection = channelSelected || selectedSound !== undefined;
  const channelName = localizeCommandLineText("BGM Channel", copy);
  const channelForm = createChannelForm({
    audioEffects: state.bgm.audioEffects,
    items: state.audioEffectItems,
    copy,
  });
  const soundForm = createSoundForm({
    sound: selectedSound,
    items: state.audioEffectItems,
    copy,
  });
  const form = selectedSound ? soundForm : channelForm;
  const channelDefaultValues = {
    interruption: state.bgm.interruption,
    volume: state.bgm.volume,
    audioEffectId: state.bgm.audioEffects?.resourceId,
    audioEffectPlaybackSpeed: normalizeAudioEffectPlaybackSpeed(
      state.bgm.audioEffects?.playback?.speed,
    ),
  };
  const defaultValues = selectedSound
    ? {
        startDelayMs: selectedSound.startDelayMs,
        loop: selectedSound.loop,
        volume: selectedSound.volume,
        beginEffectId: selectedSound.beginEffect?.resourceId,
        beginEffectPlaybackSpeed: normalizeAudioEffectPlaybackSpeed(
          selectedSound.beginEffect?.playback?.speed,
        ),
        endEffectId: selectedSound.endEffect?.resourceId,
        endEffectPlaybackSpeed: normalizeAudioEffectPlaybackSpeed(
          selectedSound.endEffect?.playback?.speed,
        ),
      }
    : channelDefaultValues;

  return {
    mode: state.mode,
    items: folderItems,
    groups,
    showResourceSelectorFileExplorer: resourceSelectorLayout.showFileExplorer,
    resourceSelectorColumns: resourceSelectorLayout.columns,
    resourceSelectorGridStyle: resourceSelectorLayout.gridStyle,
    resourceSelectorHorizontalPadding: state.isTouchMode ? "none" : "lg",
    resourceSelectorCardStyle:
      resourceSelectorLayout.cardStyle ||
      "width: 200px; min-width: 0; max-width: 100%; box-sizing: border-box;",
    sounds,
    showChannelControls: sounds.length > 0,
    isChannelEditorOpen: state.isChannelEditorOpen,
    hasSoundSelection: selectedSound !== undefined,
    hasSelection,
    channelBorderColor: channelSelected ? "pr" : "bo",
    channelHoverBorderColor: channelSelected ? "pr" : "ac",
    channelLabel: channelName,
    channelDurationLabel: formatAudioDurationMs(timeline.channelDurationMs),
    timelineDurationMs: timeline.timelineDurationMs,
    timelineHeightPx: timeline.timelineHeightPx,
    channelHeightPx: timeline.timelineHeightPx + 24,
    channelEditorTitle: channelName,
    confirmButtonLabel: localizeCommandLineText("Confirm", copy),
    editChannelLabel: localizeCommandLineText("Edit Channel", copy),
    addAudioLabel: localizeCommandLineText("Add BGM audio", copy),
    addBeforeLabel: localizeCommandLineText("Add audio before", copy),
    addAfterLabel: localizeCommandLineText("Add audio after", copy),
    selectionHeading: hasSelection
      ? localizeCommandLineText(selectedSound ? "Audio" : "Channel", copy)
      : "",
    selectionName: selectedSound?.name ?? (channelSelected ? channelName : ""),
    selectionKey: selectedSound
      ? [
          `sound-${selectedSound.id}`,
          `begin-${selectedSound.beginEffect?.resourceId ?? "none"}`,
          `end-${selectedSound.endEffect?.resourceId ?? "none"}`,
        ].join("-")
      : channelSelected
        ? "channel"
        : "none",
    form: localizeCommandLineForm(form, copy),
    defaultValues,
    channelFormKey: state.bgm.audioEffects?.resourceId
      ? "channel-with-audio-effect"
      : "channel-without-audio-effect",
    channelForm: localizeCommandLineForm(channelForm, copy),
    channelDefaultValues,
    tempSelectedResourceId: state.tempSelectedResourceId,
    searchQuery: state.searchQuery,
    searchPlaceholder: localizeCommandLineText("Search...", copy),
    playingSound: state.playingSound,
    showAudioPlayer: state.showAudioPlayer,
    breadcrumb: localizeCommandLineBreadcrumb(
      selectBreadcrumb({ state }),
      copy,
    ),
  };
};

export const setBgm = ({ state }, { bgm } = {}) => {
  state.bgm = normalizeBgm(bgm);
  state.channelSelected = false;
  state.isChannelEditorOpen = false;
  state.selectedSoundId = undefined;
  state.pendingReplacementSoundId = undefined;
  state.closeEditorAfterSoundSelection = false;
};

export const clearBgm = ({ state }, _payload = {}) => {
  state.bgm = normalizeBgm();
  state.mode = "current";
  state.channelSelected = false;
  state.isChannelEditorOpen = false;
  state.selectedSoundId = undefined;
  state.soundDrag = undefined;
  state.pendingInsertIndex = 0;
  state.tempSelectedResourceId = undefined;
  state.pendingReplacementSoundId = undefined;
  state.closeEditorAfterSoundSelection = false;
  closeAudioPlayer({ state });
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setRepositoryState = (
  { state },
  { sounds, audioEffects } = {},
) => {
  state.items = sounds ?? { items: {}, tree: [] };
  state.audioEffectItems = audioEffects ?? { items: {}, tree: [] };
};

export const clearSelectedSound = ({ state }, _payload = {}) => {
  state.channelSelected = !state.isChannelEditorOpen;
  state.selectedSoundId = undefined;
};

export const openChannelEditor = ({ state }, _payload = {}) => {
  state.mode = "current";
  state.channelSelected = false;
  state.isChannelEditorOpen = true;
  state.selectedSoundId = undefined;
  state.closeEditorAfterSoundSelection = false;
};

export const closeChannelEditor = ({ state }, _payload = {}) => {
  state.mode = "current";
  state.channelSelected = false;
  state.isChannelEditorOpen = false;
  state.selectedSoundId = undefined;
  state.soundDrag = undefined;
  state.tempSelectedResourceId = undefined;
  state.pendingReplacementSoundId = undefined;
  state.closeEditorAfterSoundSelection = false;
  closeAudioPlayer({ state });
};

export const setSelectedSound = ({ state }, { soundId } = {}) => {
  state.channelSelected = false;
  state.selectedSoundId = soundId;
};

export const updateChannel = ({ state }, { values = {} } = {}) => {
  if (values.interruption !== undefined) {
    state.bgm.interruption = normalizeAudioChannelInterruption(
      values.interruption,
    );
  }
  if (values.volume !== undefined) {
    state.bgm.volume = normalizeVolume(values.volume, DEFAULT_CHANNEL_VOLUME);
  }

  const resourceChanged = Object.hasOwn(values, "audioEffectId");
  const speedChanged = Object.hasOwn(values, "audioEffectPlaybackSpeed");
  if (!resourceChanged && !speedChanged) {
    return;
  }

  const resourceId = resourceChanged
    ? values.audioEffectId
    : state.bgm.audioEffects?.resourceId;
  if (!resourceId) {
    delete state.bgm.audioEffects;
    return;
  }

  const isNewSelection =
    resourceChanged && resourceId !== state.bgm.audioEffects?.resourceId;
  const speed = isNewSelection
    ? DEFAULT_AUDIO_EFFECT_PLAYBACK_SPEED
    : speedChanged
      ? values.audioEffectPlaybackSpeed
      : state.bgm.audioEffects?.playback?.speed;
  state.bgm.audioEffects = {
    resourceId,
    playback: {
      speed: normalizeAudioEffectPlaybackSpeed(speed),
    },
  };
};

const updateSoundBoundaryEffect = (sound, values, boundary) => {
  const effectField = `${boundary}Effect`;
  const resourceField = `${effectField}Id`;
  const speedField = `${effectField}PlaybackSpeed`;
  const resourceChanged = Object.hasOwn(values, resourceField);
  const speedChanged = Object.hasOwn(values, speedField);
  if (!resourceChanged && !speedChanged) {
    return;
  }

  const resourceId = resourceChanged
    ? values[resourceField]
    : sound[effectField]?.resourceId;
  if (!resourceId) {
    delete sound[effectField];
    return;
  }

  const isNewSelection =
    resourceChanged && resourceId !== sound[effectField]?.resourceId;
  const speed = isNewSelection
    ? DEFAULT_AUDIO_EFFECT_PLAYBACK_SPEED
    : speedChanged
      ? values[speedField]
      : sound[effectField]?.playback?.speed;
  sound[effectField] = {
    resourceId,
    playback: {
      speed: normalizeAudioEffectPlaybackSpeed(speed),
    },
  };
};

export const updateSound = ({ state }, { soundId, values = {} } = {}) => {
  const sound = state.bgm.sounds.find((item) => item.id === soundId);
  if (!sound) {
    return;
  }

  if (values.loop !== undefined) {
    sound.loop = values.loop;
    syncBgmChannelLoop(state.bgm);
  }
  if (values.volume !== undefined) {
    sound.volume = normalizeVolume(values.volume, DEFAULT_SOUND_VOLUME);
  }
  if (values.startDelayMs !== undefined) {
    sound.startDelayMs = normalizeAudioStartDelayMs(values.startDelayMs);
    sortAudioSoundsByStartDelay(state.bgm.sounds);
  }
  updateSoundBoundaryEffect(sound, values, "begin");
  updateSoundBoundaryEffect(sound, values, "end");
};

export const connectSoundToPrevious = ({ state }, { soundId } = {}) => {
  const resourceById = new Map(
    toFlatItems(state.items).map((item) => [item.id, item]),
  );
  connectAudioSoundToPrevious({
    sounds: state.bgm.sounds,
    soundId,
    resourceById,
  });
};

export const startSoundDrag = (
  { state },
  { soundId, pointerId, clientX, timelineDurationMs, timelineWidthPx } = {},
) => {
  const sound = state.bgm.sounds.find((item) => item.id === soundId);
  if (!sound || timelineDurationMs <= 0 || timelineWidthPx <= 0) {
    return;
  }

  state.channelSelected = false;
  state.selectedSoundId = soundId;
  const resourceById = new Map(
    toFlatItems(state.items).map((item) => [item.id, item]),
  );
  state.soundDrag = {
    soundId,
    pointerId,
    originClientX: clientX,
    originStartDelayMs: sound.startDelayMs,
    timelineDurationMs,
    timelineWidthPx,
    snapStartDelaysMs: createAudioTimelineSnapStartDelays({
      sounds: state.bgm.sounds,
      soundId,
      resourceById,
    }),
  };
};

export const updateSoundDrag = ({ state }, { pointerId, clientX } = {}) => {
  const drag = state.soundDrag;
  if (!drag || drag.pointerId !== pointerId) {
    return;
  }

  const sound = state.bgm.sounds.find((item) => item.id === drag.soundId);
  if (!sound) {
    state.soundDrag = undefined;
    return;
  }

  sound.startDelayMs = resolveDraggedAudioStartDelayMs({
    ...drag,
    clientX,
  });
};

export const finishSoundDrag = (
  { state },
  { pointerId, suppressChannelClickUntil } = {},
) => {
  if (!state.soundDrag || state.soundDrag.pointerId !== pointerId) {
    return;
  }

  sortAudioSoundsByStartDelay(state.bgm.sounds);
  state.soundDrag = undefined;
  state.suppressChannelClickUntil = suppressChannelClickUntil ?? 0;
};

export const insertSound = (
  { state },
  { resourceId, id = resourceId, index = state.bgm.sounds.length } = {},
) => {
  // Resource-derived ids collide when the same resource is inserted twice;
  // suffix them like normalizeSounds so channel ids stay unique.
  const existingIds = new Set(state.bgm.sounds.map((sound) => sound.id));
  let uniqueId = id;
  let duplicateIndex = 2;
  while (existingIds.has(uniqueId)) {
    uniqueId = `${id}-${duplicateIndex}`;
    duplicateIndex += 1;
  }
  const sound = normalizeSounds([
    {
      id: uniqueId,
      resourceId,
      volume: DEFAULT_SOUND_VOLUME,
    },
  ])[0];
  const insertIndex = Math.max(0, Math.min(index, state.bgm.sounds.length));
  const resourceById = new Map(
    toFlatItems(state.items).map((item) => [item.id, item]),
  );
  const insertionTiming = resolveAudioInsertionTiming({
    sounds: state.bgm.sounds,
    index: insertIndex,
    sound,
    resourceById,
  });
  sound.startDelayMs = insertionTiming.startDelayMs;
  state.bgm.sounds.slice(insertIndex).forEach((existingSound) => {
    existingSound.startDelayMs += insertionTiming.shiftMs;
  });
  state.bgm.sounds.splice(insertIndex, 0, sound);
  sortAudioSoundsByStartDelay(state.bgm.sounds);
  syncBgmChannelLoop(state.bgm);
  state.channelSelected = false;
  state.selectedSoundId = sound.id;
  state.tempSelectedResourceId = undefined;
};

export const removeSound = ({ state }, { soundId } = {}) => {
  state.bgm.sounds = state.bgm.sounds.filter((sound) => sound.id !== soundId);
  syncBgmChannelLoop(state.bgm);
  state.channelSelected = !state.isChannelEditorOpen;
  state.selectedSoundId = undefined;
};

export const replaceSoundResource = (
  { state },
  { soundId, resourceId } = {},
) => {
  const sound = state.bgm.sounds.find((item) => item.id === soundId);
  if (!sound) {
    return;
  }

  sound.resourceId = resourceId;
  state.channelSelected = false;
  state.selectedSoundId = sound.id;
  state.tempSelectedResourceId = undefined;
  state.pendingReplacementSoundId = undefined;
  closeAudioPlayer({ state });
};

export const setPendingInsertIndex = ({ state }, { index } = {}) => {
  state.pendingInsertIndex = index;
};

export const setPendingReplacement = ({ state }, { soundId } = {}) => {
  state.pendingReplacementSoundId = soundId;
};

export const setCloseEditorAfterSoundSelection = (
  { state },
  { close } = {},
) => {
  state.closeEditorAfterSoundSelection = close ?? false;
};

export const setTempSelectedResource = ({ state }, { resourceId } = {}) => {
  state.tempSelectedResourceId = resourceId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const openAudioPlayer = ({ state }, { fileId, fileName } = {}) => {
  state.playingSound.fileId = fileId;
  state.playingSound.title = fileName;
  state.showAudioPlayer = true;
};

export const closeAudioPlayer = ({ state }, _payload = {}) => {
  state.showAudioPlayer = false;
  state.playingSound = {
    title: "",
    fileId: undefined,
  };
};
