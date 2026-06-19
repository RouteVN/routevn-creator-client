const DEFAULT_AUDIO_VOLUME = 100;

const normalizeVolume = (volume) => {
  const parsedVolume = Number(volume);
  if (!Number.isFinite(parsedVolume)) {
    return undefined;
  }

  const nextVolume = parsedVolume > 100 ? parsedVolume / 10 : parsedVolume;
  return Math.max(0, Math.min(100, Math.round(nextVolume)));
};

const normalizeVoice = (voice = {}) => ({
  resourceId: voice?.resourceId,
  loop: voice?.loop ?? false,
  volume: normalizeVolume(voice?.volume) ?? DEFAULT_AUDIO_VOLUME,
  startDelayMs: voice?.startDelayMs,
});

const LOOP_OPTIONS = [
  { value: true, label: "Loop" },
  { value: false, label: "Don't Loop" },
];

export const createInitialState = () => ({
  items: { items: {}, tree: [] },
  voice: normalizeVoice(),
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
});

export const setRepositoryState = ({ state }, { voices } = {}) => {
  state.items = voices ?? { items: {}, tree: [] };
};

export const setVoice = ({ state }, { voice } = {}) => {
  state.voice = normalizeVoice(voice);
};

export const setVoiceAudio = ({ state }, { resourceId } = {}) => {
  const nextVoice = normalizeVoice(state.voice);
  nextVoice.resourceId = resourceId;
  state.voice = nextVoice;
};

export const clearVoiceAudio = ({ state }, _payload = {}) => {
  state.voice.resourceId = undefined;
};

export const setLoop = ({ state }, { loop } = {}) => {
  state.voice.loop = loop;
};

export const setVolume = ({ state }, { volume } = {}) => {
  state.voice.volume = normalizeVolume(volume);
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

export const selectVoice = ({ state }) => state.voice;

export const selectSelectedResource = ({ state }) => {
  const resourceId = state.voice.resourceId;
  if (!resourceId) {
    return undefined;
  }

  const item = state.items.items?.[resourceId];
  if (!item) {
    return undefined;
  }

  return {
    ...item,
    resourceId,
    itemBorderColor: "bo",
    itemHoverBorderColor: "ac",
  };
};

export const selectVoicePayload = ({ state }) => {
  const voice = normalizeVoice(state.voice);
  const payload = {
    resourceId: voice.resourceId,
    loop: voice.loop,
  };

  if (voice.volume !== undefined) {
    payload.volume = voice.volume;
  }

  if (voice.startDelayMs !== undefined) {
    payload.startDelayMs = voice.startDelayMs;
  }

  return payload;
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

export const selectViewData = ({ state }) => {
  const audio = selectSelectedResource({ state });

  return {
    audio,
    breadcrumb: selectBreadcrumb({ state }),
    loopOptions: LOOP_OPTIONS,
    voice: {
      ...state.voice,
      volume: state.voice.volume ?? DEFAULT_AUDIO_VOLUME,
    },
    playingSound: state.playingSound,
    showAudioPlayer: state.showAudioPlayer,
  };
};
