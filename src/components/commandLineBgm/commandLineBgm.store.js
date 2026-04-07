import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";

const normalizeBgm = (bgm = {}) => ({
  resourceId: bgm?.resourceId,
  loop: bgm?.loop ?? true,
  volume: bgm?.volume ?? 500,
  delay: bgm?.delay,
});

const form = {
  fields: [
    {
      type: "slot",
      slot: "audio",
      description: "Background Music",
    },
    {
      name: "loop",
      description: "Loop",
      type: "select",
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
      max: 1000,
      step: 1,
    },
  ],
};

export const createInitialState = () => ({
  mode: "current",
  items: { items: {}, tree: [] },
  selectedResourceId: undefined,
  tempSelectedResourceId: undefined,
  bgm: normalizeBgm(),
  searchQuery: "",
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
});

export const setBgmAudio = ({ state }, { resourceId } = {}) => {
  state.bgm = {
    ...normalizeBgm(state.bgm),
    resourceId,
  };
};

export const setBgm = ({ state }, { bgm } = {}) => {
  state.bgm = normalizeBgm(bgm);
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setRepositoryState = ({ state }, { sounds } = {}) => {
  state.items = sounds;
};

export const selectBgm = ({ state }) => {
  return state.bgm;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
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

export const selectSelectedResource = ({ state }) => {
  if (!state.bgm.resourceId) {
    return null;
  }

  const flatItems = toFlatItems(state.items);
  const item = flatItems.find((item) => item.id === state.bgm.resourceId);

  if (!item) {
    return null;
  }

  return {
    resourceId: state.bgm.resourceId,
    fileId: item.fileId,
    name: item.name,
    item: item,
  };
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

export const selectViewData = ({ state }) => {
  const flatItems = toFlatItems(state.items).filter(
    (item) => item.type === "folder",
  );
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };
  const flatGroups = toFlatGroups(state.items)
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
        hasChildren: children.length > 0,
        shouldDisplay: !searchQuery || children.length > 0,
      };
    })
    .filter((group) => group.shouldDisplay);

  const selectedResource = selectSelectedResource({ state });
  const breadcrumb = selectBreadcrumb({ state });

  const defaultValues = {
    loop: state.bgm?.loop ?? true,
    volume: state.bgm?.volume ?? 500,
    delay: state.bgm?.delay,
    audioWaveformDataFileId: selectedResource?.item?.waveformDataFileId || "",
  };

  return {
    mode: state.mode,
    audio: selectedResource?.item,
    items: flatItems,
    groups: flatGroups,
    tempSelectedResourceId: state.tempSelectedResourceId,
    searchQuery: state.searchQuery,
    searchPlaceholder: "Search...",
    playingSound: state.playingSound,
    showAudioPlayer: state.showAudioPlayer,
    breadcrumb,
    form,
    defaultValues,
  };
};
