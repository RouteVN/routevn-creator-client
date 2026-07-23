import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

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

const resolveSoundDurationMs = (sound, resource) => {
  const resourceDurationSeconds = Math.max(0, Number(resource?.duration) || 0);
  const startAtSeconds = Math.max(0, Number(sound.startAt) || 0);
  const endAtSeconds =
    sound.endAt !== undefined && sound.endAt !== null
      ? Math.max(startAtSeconds, Number(sound.endAt) || 0)
      : resourceDurationSeconds;
  const playbackRate = Number(sound.playbackRate) || 1;
  return Math.max(
    0,
    Math.round(((endAtSeconds - startAtSeconds) / playbackRate) * 1000),
  );
};

const formatDurationMs = (durationMs) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const reflowSounds = (sounds, items) => {
  const resourceById = new Map(
    toFlatItems(items).map((item) => [item.id, item]),
  );
  let startDelayMs = 0;

  sounds.forEach((sound) => {
    sound.startDelayMs = startDelayMs;
    startDelayMs += resolveSoundDurationMs(
      sound,
      resourceById.get(sound.resourceId),
    );
  });
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
      loop: false,
      volume: normalizeVolume(sound.volume, DEFAULT_SOUND_VOLUME),
      startDelayMs: 0,
    };
    for (const field of ["muted", "pan", "playbackRate", "startAt", "endAt"]) {
      if (sound[field] !== undefined) {
        normalizedSound[field] = sound[field];
      }
    }
    return normalizedSound;
  });
};

const normalizeBgm = (bgm = {}, items = { items: {}, tree: [] }) => {
  const normalizedBgm = {
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
      },
    ]);
  }

  reflowSounds(normalizedBgm.sounds, items);
  return normalizedBgm;
};

const CHANNEL_FORM = {
  fields: [
    {
      name: "loop",
      description: "Loop",
      type: "segmented-control",
      options: [
        { value: true, label: "Loop" },
        { value: false, label: "Don't Loop" },
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
};

const SOUND_FORM = {
  fields: [
    {
      name: "volume",
      description: "Volume",
      type: "slider-with-input",
      min: 0,
      max: 100,
      step: 1,
    },
  ],
};

export const createInitialState = () => ({
  mode: "current",
  items: { items: {}, tree: [] },
  tempSelectedResourceId: undefined,
  pendingInsertIndex: 0,
  selectedSoundId: undefined,
  bgm: normalizeBgm(),
  searchQuery: "",
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
});

export const selectBgm = ({ state }) => state.bgm;

export const selectSelectedSoundId = ({ state }) => state.selectedSoundId;

export const selectSelectedSound = ({ state }) => {
  return state.bgm.sounds.find((sound) => sound.id === state.selectedSoundId);
};

export const selectPendingInsertIndex = ({ state }) => {
  return state.pendingInsertIndex;
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

  const durations = state.bgm.sounds.map((sound) => {
    return resolveSoundDurationMs(
      sound,
      soundResourceById.get(sound.resourceId),
    );
  });
  const channelDurationMs = durations.reduce((total, duration) => {
    return total + Math.max(0, duration);
  }, 0);
  const equalWidth = state.bgm.sounds.length
    ? 100 / state.bgm.sounds.length
    : 100;
  const sounds = state.bgm.sounds.map((sound, index) => {
    const resource = soundResourceById.get(sound.resourceId);
    const isSelected = sound.id === state.selectedSoundId;
    const widthPercent =
      channelDurationMs > 0
        ? (Math.max(0, durations[index]) / channelDurationMs) * 100
        : equalWidth;
    return {
      ...sound,
      name: resource?.name ?? sound.resourceId,
      fileId: resource?.fileId,
      waveformDataFileId: resource?.waveformDataFileId,
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
      durationLabel: formatDurationMs(durations[index]),
      widthPercent: widthPercent.toFixed(4),
    };
  });
  const selectedSound = sounds.find(
    (sound) => sound.id === state.selectedSoundId,
  );
  const channelSelected = selectedSound === undefined;
  const channelName = localizeCommandLineText("BGM Channel", copy);
  const form = channelSelected ? CHANNEL_FORM : SOUND_FORM;
  const defaultValues = channelSelected
    ? {
        loop: state.bgm.loop,
        volume: state.bgm.volume,
      }
    : {
        volume: selectedSound.volume,
      };

  return {
    mode: state.mode,
    items: folderItems,
    groups,
    sounds,
    channelBorderColor: channelSelected ? "pr" : "bo",
    channelHoverBorderColor: channelSelected ? "pr" : "ac",
    channelLabel: channelName,
    channelDurationLabel: formatDurationMs(channelDurationMs),
    audioLabel: localizeCommandLineText("Audio", copy),
    addAudioLabel: localizeCommandLineText("Add BGM audio", copy),
    addBeforeLabel: localizeCommandLineText("Add audio before", copy),
    addAfterLabel: localizeCommandLineText("Add audio after", copy),
    selectionHeading: localizeCommandLineText(
      channelSelected ? "Channel" : "Audio",
      copy,
    ),
    selectionName: channelSelected ? channelName : selectedSound.name,
    selectionKey: channelSelected ? "channel" : `sound-${selectedSound.id}`,
    form: localizeCommandLineForm(form, copy),
    defaultValues,
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
  state.bgm = normalizeBgm(bgm, state.items);
  state.selectedSoundId = undefined;
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setRepositoryState = ({ state }, { sounds } = {}) => {
  state.items = sounds;
  state.bgm = normalizeBgm(state.bgm, state.items);
};

export const clearSelectedSound = ({ state }, _payload = {}) => {
  state.selectedSoundId = undefined;
};

export const setSelectedSound = ({ state }, { soundId } = {}) => {
  state.selectedSoundId = soundId;
};

export const updateChannel = ({ state }, { values = {} } = {}) => {
  if (values.loop !== undefined) {
    state.bgm.loop = values.loop;
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

  if (values.volume !== undefined) {
    sound.volume = normalizeVolume(values.volume, DEFAULT_SOUND_VOLUME);
  }
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
  state.bgm.sounds.splice(insertIndex, 0, sound);
  reflowSounds(state.bgm.sounds, state.items);
  state.selectedSoundId = sound.id;
  state.tempSelectedResourceId = undefined;
};

export const removeSound = ({ state }, { soundId } = {}) => {
  state.bgm.sounds = state.bgm.sounds.filter((sound) => sound.id !== soundId);
  reflowSounds(state.bgm.sounds, state.items);
  state.selectedSoundId = undefined;
};

export const setPendingInsertIndex = ({ state }, { index } = {}) => {
  state.pendingInsertIndex = index;
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
