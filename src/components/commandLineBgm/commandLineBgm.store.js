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
const LEGACY_SOUND_ID = "default";

const normalizeVolume = (volume, fallback) => {
  const parsedVolume = Number(volume);
  if (!Number.isFinite(parsedVolume)) {
    return fallback;
  }

  const nextVolume = parsedVolume > 100 ? parsedVolume / 10 : parsedVolume;
  return Math.max(0, Math.min(100, Math.round(nextVolume)));
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
        id: LEGACY_SOUND_ID,
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

  sortAudioSoundsByStartDelay(normalizedBgm.sounds);
  return normalizedBgm;
};

const CHANNEL_FORM = {
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
  ],
};

const SOUND_FORM = {
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
  ],
};

export const createInitialState = () => ({
  mode: "current",
  items: { items: {}, tree: [] },
  tempSelectedResourceId: undefined,
  pendingInsertIndex: 0,
  pendingReplacementSoundId: undefined,
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
  const form = selectedSound ? SOUND_FORM : CHANNEL_FORM;
  const defaultValues = selectedSound
    ? {
        startDelayMs: selectedSound.startDelayMs,
        loop: selectedSound.loop,
        volume: selectedSound.volume,
      }
    : {
        interruption: state.bgm.interruption,
        volume: state.bgm.volume,
      };

  return {
    mode: state.mode,
    items: folderItems,
    groups,
    showResourceSelectorFileExplorer: resourceSelectorLayout.showFileExplorer,
    resourceSelectorColumns: resourceSelectorLayout.columns,
    resourceSelectorGridStyle: resourceSelectorLayout.gridStyle,
    resourceSelectorItemStyle: resourceSelectorLayout.itemStyle,
    resourceSelectorCardStyle: resourceSelectorLayout.cardStyle,
    resourceSelectorPreviewStyle: resourceSelectorLayout.previewStyle,
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
      ? `sound-${selectedSound.id}`
      : channelSelected
        ? "channel"
        : "none",
    form: localizeCommandLineForm(form, copy),
    defaultValues,
    channelForm: localizeCommandLineForm(CHANNEL_FORM, copy),
    channelDefaultValues: {
      interruption: state.bgm.interruption,
      volume: state.bgm.volume,
    },
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
  closeAudioPlayer({ state });
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setRepositoryState = ({ state }, { sounds } = {}) => {
  state.items = sounds;
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
};

export const closeChannelEditor = ({ state }, _payload = {}) => {
  state.mode = "current";
  state.channelSelected = false;
  state.isChannelEditorOpen = false;
  state.selectedSoundId = undefined;
  state.soundDrag = undefined;
  state.tempSelectedResourceId = undefined;
  state.pendingReplacementSoundId = undefined;
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
  { id, resourceId, index = state.bgm.sounds.length } = {},
) => {
  const sound = normalizeSounds([
    {
      id,
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
