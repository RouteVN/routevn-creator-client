import { toFlatItems } from "../../internal/project/tree.js";
import {
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

const normalizeVoice = (voice = {}) => {
  const normalizedVoice = {
    interruption: normalizeAudioChannelInterruption(voice.interruption),
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
        startDelayMs: voice.startDelayMs,
      },
    ]);
  }

  sortAudioSoundsByStartDelay(normalizedVoice.sounds);
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
};

const SOUND_FORM = {
  fields: [
    {
      name: "startDelayMs",
      label: "Start Delay (ms)",
      type: "input-number",
      min: 0,
      step: 10,
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

export const createInitialState = () => ({
  items: { items: {}, tree: [] },
  selectedSoundId: undefined,
  soundDrag: undefined,
  suppressChannelClickUntil: 0,
  voice: normalizeVoice(),
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
});

export const selectVoice = ({ state }) => state.voice;

export const selectVoicePayload = ({ state }) => {
  return normalizeVoice(state.voice);
};

export const selectSelectedSoundId = ({ state }) => state.selectedSoundId;

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
  const timeline = createAudioTimelineLayout({
    sounds: state.voice.sounds,
    resourceById,
  });
  const sounds = timeline.sounds.map((timelineSound) => {
    const { sound, durationMs } = timelineSound;
    const resource = resourceById.get(sound.resourceId);
    const isSelected = sound.id === state.selectedSoundId;
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
  const channelSelected = selectedSound === undefined;
  const channelName = localizeCommandLineText("Voice Channel", copy);
  const form = channelSelected ? CHANNEL_FORM : SOUND_FORM;
  const defaultValues = channelSelected
    ? {
        interruption: state.voice.interruption,
        loop: state.voice.loop,
        volume: state.voice.volume,
      }
    : {
        startDelayMs: selectedSound.startDelayMs,
        volume: selectedSound.volume,
      };

  return {
    sounds,
    channelBorderColor: channelSelected ? "pr" : "bo",
    channelHoverBorderColor: channelSelected ? "pr" : "ac",
    channelLabel: channelName,
    channelDurationLabel: formatAudioDurationMs(timeline.channelDurationMs),
    timelineDurationMs: timeline.timelineDurationMs,
    timelineHeightPx: timeline.timelineHeightPx,
    channelHeightPx: timeline.timelineHeightPx + 24,
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
};

export const setVoice = ({ state }, { voice } = {}) => {
  state.voice = normalizeVoice(voice);
  state.selectedSoundId = undefined;
};

export const clearSelectedSound = ({ state }, _payload = {}) => {
  state.selectedSoundId = undefined;
};

export const setSelectedSound = ({ state }, { soundId } = {}) => {
  state.selectedSoundId = soundId;
};

export const updateChannel = ({ state }, { values = {} } = {}) => {
  if (values.interruption !== undefined) {
    state.voice.interruption = normalizeAudioChannelInterruption(
      values.interruption,
    );
  }
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
  if (values.startDelayMs !== undefined) {
    sound.startDelayMs = normalizeAudioStartDelayMs(values.startDelayMs);
    sortAudioSoundsByStartDelay(state.voice.sounds);
  }
};

export const startSoundDrag = (
  { state },
  { soundId, pointerId, clientX, timelineDurationMs, timelineWidthPx } = {},
) => {
  const sound = state.voice.sounds.find((item) => item.id === soundId);
  if (!sound || timelineDurationMs <= 0 || timelineWidthPx <= 0) {
    return;
  }

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
      sounds: state.voice.sounds,
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

  const sound = state.voice.sounds.find((item) => item.id === drag.soundId);
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

  sortAudioSoundsByStartDelay(state.voice.sounds);
  state.soundDrag = undefined;
  state.suppressChannelClickUntil = suppressChannelClickUntil ?? 0;
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
  const resourceById = new Map(
    toFlatItems(state.items).map((item) => [item.id, item]),
  );
  const insertionTiming = resolveAudioInsertionTiming({
    sounds: state.voice.sounds,
    index: insertIndex,
    sound,
    resourceById,
  });
  sound.startDelayMs = insertionTiming.startDelayMs;
  state.voice.sounds.slice(insertIndex).forEach((existingSound) => {
    existingSound.startDelayMs += insertionTiming.shiftMs;
  });
  state.voice.sounds.splice(insertIndex, 0, sound);
  sortAudioSoundsByStartDelay(state.voice.sounds);
  state.selectedSoundId = sound.id;
  closeAudioPlayer({ state });
};

export const removeSound = ({ state }, { soundId } = {}) => {
  state.voice.sounds = state.voice.sounds.filter(
    (sound) => sound.id !== soundId,
  );
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
