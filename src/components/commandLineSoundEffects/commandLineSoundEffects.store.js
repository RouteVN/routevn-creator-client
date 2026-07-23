import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const DEFAULT_CHANNEL_VOLUME = 75;
const DEFAULT_SOUND_VOLUME = 100;
const DEFAULT_LEGACY_SOUND_VOLUME = 75;
const LEGACY_CHANNEL_ID = "default";

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

const normalizeSounds = (
  sounds = [],
  { defaultVolume = DEFAULT_SOUND_VOLUME } = {},
) => {
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
      volume: normalizeVolume(sound.volume, defaultVolume),
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

const normalizeChannel = (
  channel = {},
  items = { items: {}, tree: [] },
  {
    defaultChannelVolume = DEFAULT_CHANNEL_VOLUME,
    defaultSoundVolume = DEFAULT_SOUND_VOLUME,
  } = {},
) => {
  const normalizedChannel = {
    id: String(channel.id ?? "").trim(),
    volume: normalizeVolume(channel.volume, defaultChannelVolume),
    sounds: normalizeSounds(channel.sounds, {
      defaultVolume: defaultSoundVolume,
    }),
  };
  for (const field of ["muted", "pan"]) {
    if (channel[field] !== undefined) {
      normalizedChannel[field] = channel[field];
    }
  }
  reflowSounds(normalizedChannel.sounds, items);
  return normalizedChannel;
};

const normalizeSfxChannels = (sfx = {}, items = { items: {}, tree: [] }) => {
  if (Array.isArray(sfx?.channels)) {
    const usedIds = new Set();
    return sfx.channels.map((channel, index) => {
      const fallbackId = `channel-${index + 1}`;
      const baseId = String(channel.id ?? fallbackId).trim() || fallbackId;
      let id = baseId;
      let duplicateIndex = 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${duplicateIndex}`;
        duplicateIndex += 1;
      }
      usedIds.add(id);
      return normalizeChannel({ ...channel, id }, items);
    });
  }

  if (Array.isArray(sfx?.items) && sfx.items.length > 0) {
    return [
      normalizeChannel(
        {
          id: LEGACY_CHANNEL_ID,
          volume: 100,
          sounds: sfx.items,
        },
        items,
        {
          defaultChannelVolume: 100,
          defaultSoundVolume: DEFAULT_LEGACY_SOUND_VOLUME,
        },
      ),
    ];
  }

  return [];
};

const CHANNEL_FORM = {
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

const SOUND_FORM = {
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

const ADD_CHANNEL_FORM = {
  title: "Add Channel",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Channel Name",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Add Channel",
      },
    ],
  },
};

export const createInitialState = () => ({
  mode: "current",
  items: { items: {}, tree: [] },
  channels: [],
  selectedChannelId: undefined,
  selectedSoundId: undefined,
  pendingChannelId: undefined,
  pendingInsertIndex: 0,
  tempSelectedResourceId: undefined,
  searchQuery: "",
  addChannelPopover: {
    isOpen: false,
    position: { x: 0, y: 0 },
    key: 0,
  },
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
});

export const selectChannels = ({ state }) => state.channels;

export const selectSfx = ({ state }) => ({ channels: state.channels });

export const selectSelectedChannelId = ({ state }) => {
  return state.selectedChannelId;
};

export const selectSelectedSoundId = ({ state }) => state.selectedSoundId;

export const selectPendingChannelId = ({ state }) => state.pendingChannelId;

export const selectPendingInsertIndex = ({ state }) => {
  return state.pendingInsertIndex;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const selectChannelById = ({ state }, { channelId } = {}) => {
  return state.channels.find((channel) => channel.id === channelId);
};

export const selectChannelIndexById = ({ state }, { channelId } = {}) => {
  return state.channels.findIndex((channel) => channel.id === channelId);
};

export const selectSoundById = ({ state }, { channelId, soundId } = {}) => {
  return state.channels
    .find((channel) => channel.id === channelId)
    ?.sounds.find((sound) => sound.id === soundId);
};

export const selectSoundIndexById = (
  { state },
  { channelId, soundId } = {},
) => {
  const channel = state.channels.find((item) => item.id === channelId);
  return channel?.sounds.findIndex((sound) => sound.id === soundId) ?? -1;
};

export const selectSoundItemById = ({ state }, { itemId } = {}) => {
  return toFlatItems(state.items).find((item) => item.id === itemId);
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
      label: "Sound Effects",
      click: true,
    });
    breadcrumb.push({
      label: "Audio Selection",
    });
  } else {
    breadcrumb.push({
      label: "Sound Effects",
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

  const channelDurations = state.channels.map((channel) => {
    return channel.sounds.map((sound) => {
      return resolveSoundDurationMs(
        sound,
        soundResourceById.get(sound.resourceId),
      );
    });
  });
  const channelDurationTotals = channelDurations.map((durations) => {
    return durations.reduce((total, duration) => {
      return total + Math.max(0, duration);
    }, 0);
  });
  const longestChannelDurationMs = Math.max(0, ...channelDurationTotals);
  const longestChannelSoundCount = Math.max(
    0,
    ...state.channels.map((channel) => channel.sounds.length),
  );

  const channels = state.channels.map((channel, channelIndex) => {
    const durations = channelDurations[channelIndex];
    const channelDurationMs = channelDurationTotals[channelIndex];
    const equalWidth = channel.sounds.length
      ? 100 / channel.sounds.length
      : 100;
    const timelineWidthPercent =
      longestChannelDurationMs > 0
        ? (channelDurationMs / longestChannelDurationMs) * 100
        : longestChannelSoundCount > 0
          ? (channel.sounds.length / longestChannelSoundCount) * 100
          : 100;
    const channelSelected =
      channel.id === state.selectedChannelId &&
      state.selectedSoundId === undefined;
    const sounds = channel.sounds.map((sound, soundIndex) => {
      const resource = soundResourceById.get(sound.resourceId);
      const isSelected =
        channel.id === state.selectedChannelId &&
        sound.id === state.selectedSoundId;
      const widthPercent =
        channelDurationMs > 0
          ? (Math.max(0, durations[soundIndex]) / channelDurationMs) * 100
          : equalWidth;

      return {
        ...sound,
        name: resource?.name ?? sound.resourceId,
        fileId: resource?.fileId,
        waveformDataFileId: resource?.waveformDataFileId,
        itemBorderColor: isSelected ? "pr" : "bo",
        itemHoverBorderColor: isSelected ? "pr" : "ac",
        durationLabel: formatDurationMs(durations[soundIndex]),
        widthPercent: widthPercent.toFixed(4),
        insertBeforeIndex: soundIndex,
        insertAfterIndex: soundIndex + 1,
      };
    });

    return {
      ...channel,
      channelIndex,
      sounds,
      channelBorderColor: channelSelected ? "pr" : "bo",
      channelHoverBorderColor: channelSelected ? "pr" : "ac",
      durationLabel: formatDurationMs(channelDurationMs),
      timelineWidthPercent: timelineWidthPercent.toFixed(4),
    };
  });

  const selectedChannel = channels.find(
    (channel) => channel.id === state.selectedChannelId,
  );
  const selectedSound = selectedChannel?.sounds.find(
    (sound) => sound.id === state.selectedSoundId,
  );
  const hasSelection = selectedChannel !== undefined;
  const form = selectedSound ? SOUND_FORM : CHANNEL_FORM;
  const defaultValues = selectedSound
    ? {
        loop: selectedSound.loop,
        volume: selectedSound.volume,
      }
    : {
        volume: selectedChannel?.volume ?? DEFAULT_CHANNEL_VOLUME,
      };

  return {
    mode: state.mode,
    items: folderItems,
    groups,
    channels,
    hasSelection,
    selectionHeading: hasSelection
      ? localizeCommandLineText(selectedSound ? "Audio" : "Channel", copy)
      : "",
    selectionName: selectedSound?.name ?? selectedChannel?.id ?? "",
    selectionKey: selectedSound
      ? `sound-${selectedChannel.id}-${selectedSound.id}`
      : `channel-${selectedChannel?.id ?? "none"}`,
    form: localizeCommandLineForm(form, copy),
    defaultValues,
    addChannelPopover: state.addChannelPopover,
    addChannelForm: localizeCommandLineForm(ADD_CHANNEL_FORM, copy),
    addChannelDefaultValues: { name: "" },
    addChannelButtonLabel: localizeCommandLineText("+ Add Channel", copy),
    addSoundLabel: localizeCommandLineText("Add sound effect", copy),
    addBeforeLabel: localizeCommandLineText("Add audio before", copy),
    addAfterLabel: localizeCommandLineText("Add audio after", copy),
    tempSelectedResourceId: state.tempSelectedResourceId,
    searchQuery: state.searchQuery,
    searchPlaceholder: localizeCommandLineText("Search...", copy),
    playingSound: state.playingSound,
    showAudioPlayer: state.showAudioPlayer,
    breadcrumb: localizeCommandLineBreadcrumb(
      selectBreadcrumb({ state }),
      copy,
    ),
    submitButtonLabel: localizeCommandLineText("Submit", copy),
    selectButtonLabel: localizeCommandLineText("Select", copy),
  };
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setRepositoryState = ({ state }, { sounds } = {}) => {
  state.items = sounds;
  state.channels.forEach((channel) => {
    reflowSounds(channel.sounds, state.items);
  });
};

export const setSfx = ({ state }, { sfx } = {}) => {
  state.channels = normalizeSfxChannels(sfx, state.items);
  state.selectedChannelId = state.channels[0]?.id;
  state.selectedSoundId = undefined;
};

export const addChannel = ({ state }, { id } = {}) => {
  const channelId = String(id ?? "").trim();
  if (
    !channelId ||
    state.channels.some((channel) => channel.id === channelId)
  ) {
    return;
  }

  state.channels.push(
    normalizeChannel(
      {
        id: channelId,
        sounds: [],
      },
      state.items,
    ),
  );
  state.selectedChannelId = channelId;
  state.selectedSoundId = undefined;
};

export const removeChannel = ({ state }, { channelId } = {}) => {
  const channelIndex = state.channels.findIndex(
    (channel) => channel.id === channelId,
  );
  if (channelIndex === -1) {
    return;
  }

  state.channels.splice(channelIndex, 1);
  if (state.selectedChannelId === channelId) {
    const nextSelectedIndex = Math.min(channelIndex, state.channels.length - 1);
    state.selectedChannelId = state.channels[nextSelectedIndex]?.id;
    state.selectedSoundId = undefined;
  }
};

export const moveChannel = ({ state }, { channelId, direction } = {}) => {
  const channelIndex = state.channels.findIndex(
    (channel) => channel.id === channelId,
  );
  if (channelIndex === -1) {
    return;
  }

  const targetIndex = direction === "up" ? channelIndex - 1 : channelIndex + 1;
  if (targetIndex < 0 || targetIndex >= state.channels.length) {
    return;
  }

  const [channel] = state.channels.splice(channelIndex, 1);
  state.channels.splice(targetIndex, 0, channel);
};

export const setSelectedChannel = ({ state }, { channelId } = {}) => {
  state.selectedChannelId = channelId;
  state.selectedSoundId = undefined;
};

export const setSelectedSound = ({ state }, { channelId, soundId } = {}) => {
  state.selectedChannelId = channelId;
  state.selectedSoundId = soundId;
};

export const updateChannel = ({ state }, { channelId, values = {} } = {}) => {
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel) {
    return;
  }

  if (values.volume !== undefined) {
    channel.volume = normalizeVolume(values.volume, DEFAULT_CHANNEL_VOLUME);
  }
};

export const updateSound = (
  { state },
  { channelId, soundId, values = {} } = {},
) => {
  const sound = state.channels
    .find((channel) => channel.id === channelId)
    ?.sounds.find((item) => item.id === soundId);
  if (!sound) {
    return;
  }

  if (values.loop !== undefined) {
    sound.loop = values.loop;
  }
  if (values.volume !== undefined) {
    sound.volume = normalizeVolume(values.volume, DEFAULT_SOUND_VOLUME);
  }
};

export const insertSound = (
  { state },
  { channelId, id, resourceId, index } = {},
) => {
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel) {
    return;
  }

  const usedIds = new Set(channel.sounds.map((sound) => sound.id));
  const baseId = id ?? resourceId ?? `sound-${channel.sounds.length + 1}`;
  let soundId = baseId;
  let duplicateIndex = 2;
  while (usedIds.has(soundId)) {
    soundId = `${baseId}-${duplicateIndex}`;
    duplicateIndex += 1;
  }
  const sound = normalizeSounds([
    {
      id: soundId,
      resourceId,
      loop: false,
      volume: DEFAULT_SOUND_VOLUME,
    },
  ])[0];
  const insertIndex = Math.max(
    0,
    Math.min(index ?? channel.sounds.length, channel.sounds.length),
  );
  channel.sounds.splice(insertIndex, 0, sound);
  reflowSounds(channel.sounds, state.items);
  state.selectedChannelId = channel.id;
  state.selectedSoundId = sound.id;
  state.tempSelectedResourceId = undefined;
};

export const removeSound = ({ state }, { channelId, soundId } = {}) => {
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel) {
    return;
  }

  channel.sounds = channel.sounds.filter((sound) => sound.id !== soundId);
  reflowSounds(channel.sounds, state.items);
  state.selectedChannelId = channel.id;
  state.selectedSoundId = undefined;
};

export const setPendingInsertion = ({ state }, { channelId, index } = {}) => {
  state.pendingChannelId = channelId;
  state.pendingInsertIndex = index;
};

export const setTempSelectedResource = ({ state }, { resourceId } = {}) => {
  state.tempSelectedResourceId = resourceId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const openAddChannelPopover = ({ state }, { position } = {}) => {
  state.addChannelPopover.isOpen = true;
  state.addChannelPopover.position = position ?? { x: 0, y: 0 };
  state.addChannelPopover.key += 1;
};

export const hideAddChannelPopover = ({ state }, _payload = {}) => {
  state.addChannelPopover.isOpen = false;
  state.addChannelPopover.position = { x: 0, y: 0 };
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
