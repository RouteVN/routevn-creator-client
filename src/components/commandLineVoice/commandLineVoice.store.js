import { toFlatItems } from "../../internal/project/tree.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const DEFAULT_CHANNEL_VOLUME = 100;
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
    const fallbackId = sound.resourceId ?? `voice-${index + 1}`;
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

const normalizeVoice = (voice = {}, items = { items: {}, tree: [] }) => {
  const normalizedVoice = {
    loop: voice.loop ?? false,
    volume: normalizeVolume(voice.volume, DEFAULT_CHANNEL_VOLUME),
    sounds: [],
  };

  if (Array.isArray(voice.sounds)) {
    normalizedVoice.sounds = normalizeSounds(voice.sounds);
  } else if (voice.resourceId !== undefined) {
    normalizedVoice.sounds = normalizeSounds([
      {
        id: LEGACY_SOUND_ID,
        resourceId: voice.resourceId,
        volume: DEFAULT_SOUND_VOLUME,
      },
    ]);
  }

  reflowSounds(normalizedVoice.sounds, items);
  return normalizedVoice;
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
  items: { items: {}, tree: [] },
  selectedSoundId: undefined,
  voice: normalizeVoice(),
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
});

export const selectVoice = ({ state }) => state.voice;

export const selectVoicePayload = ({ state }) => {
  return normalizeVoice(state.voice, state.items);
};

export const selectSelectedSoundId = ({ state }) => state.selectedSoundId;

export const selectVoiceSoundById = ({ state }, { soundId } = {}) => {
  return state.voice.sounds.find((sound) => sound.id === soundId);
};

export const selectVoiceSoundIndexById = ({ state }, { soundId } = {}) => {
  return state.voice.sounds.findIndex((sound) => sound.id === soundId);
};

export const selectVoiceItemById = ({ state }, { itemId } = {}) => {
  return toFlatItems(state.items).find((item) => item.id === itemId);
};

export const selectBreadcrumb = (_context) => [
  {
    id: "actions",
    label: "Actions",
    click: true,
  },
  {
    label: "Voice",
  },
];

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const flatVoiceItems = toFlatItems(state.items);
  const resourceById = new Map(flatVoiceItems.map((item) => [item.id, item]));
  const durations = state.voice.sounds.map((sound) => {
    return resolveSoundDurationMs(sound, resourceById.get(sound.resourceId));
  });
  const channelDurationMs = durations.reduce((total, duration) => {
    return total + Math.max(0, duration);
  }, 0);
  const equalWidth = state.voice.sounds.length
    ? 100 / state.voice.sounds.length
    : 100;
  const sounds = state.voice.sounds.map((sound, index) => {
    const resource = resourceById.get(sound.resourceId);
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
  const channelName = localizeCommandLineText("Voice Channel", copy);
  const form = channelSelected ? CHANNEL_FORM : SOUND_FORM;
  const defaultValues = channelSelected
    ? {
        loop: state.voice.loop,
        volume: state.voice.volume,
      }
    : {
        volume: selectedSound.volume,
      };

  return {
    sounds,
    channelBorderColor: channelSelected ? "pr" : "bo",
    channelHoverBorderColor: channelSelected ? "pr" : "ac",
    channelLabel: channelName,
    channelDurationLabel: formatDurationMs(channelDurationMs),
    addAudioLabel: localizeCommandLineText("Add voice audio", copy),
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
    playingSound: state.playingSound,
    showAudioPlayer: state.showAudioPlayer,
    breadcrumb: localizeCommandLineBreadcrumb(
      selectBreadcrumb({ state }),
      copy,
    ),
  };
};

export const setRepositoryState = ({ state }, { voices } = {}) => {
  state.items = voices ?? { items: {}, tree: [] };
  state.voice = normalizeVoice(state.voice, state.items);
};

export const setVoice = ({ state }, { voice } = {}) => {
  state.voice = normalizeVoice(voice, state.items);
  state.selectedSoundId = undefined;
};

export const clearSelectedSound = ({ state }, _payload = {}) => {
  state.selectedSoundId = undefined;
};

export const setSelectedSound = ({ state }, { soundId } = {}) => {
  state.selectedSoundId = soundId;
};

export const updateChannel = ({ state }, { values = {} } = {}) => {
  if (values.loop !== undefined) {
    state.voice.loop = values.loop;
  }
  if (values.volume !== undefined) {
    state.voice.volume = normalizeVolume(values.volume, DEFAULT_CHANNEL_VOLUME);
  }
};

export const updateSound = ({ state }, { soundId, values = {} } = {}) => {
  const sound = state.voice.sounds.find((item) => item.id === soundId);
  if (!sound) {
    return;
  }

  if (values.volume !== undefined) {
    sound.volume = normalizeVolume(values.volume, DEFAULT_SOUND_VOLUME);
  }
};

export const insertSound = (
  { state },
  { id, resourceId, index = state.voice.sounds.length } = {},
) => {
  const sound = normalizeSounds([
    {
      id,
      resourceId,
      volume: DEFAULT_SOUND_VOLUME,
    },
  ])[0];
  const insertIndex = Math.max(0, Math.min(index, state.voice.sounds.length));
  state.voice.sounds.splice(insertIndex, 0, sound);
  reflowSounds(state.voice.sounds, state.items);
  state.selectedSoundId = sound.id;
  closeAudioPlayer({ state });
};

export const removeSound = ({ state }, { soundId } = {}) => {
  state.voice.sounds = state.voice.sounds.filter(
    (sound) => sound.id !== soundId,
  );
  reflowSounds(state.voice.sounds, state.items);
  state.selectedSoundId = undefined;
  closeAudioPlayer({ state });
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
