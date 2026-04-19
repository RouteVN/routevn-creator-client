import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";

const normalizeVolume = (volume, fallback = 50) => {
  const parsedVolume = Number(volume);
  if (!Number.isFinite(parsedVolume)) {
    return fallback;
  }

  const nextVolume = parsedVolume > 100 ? parsedVolume / 10 : parsedVolume;
  return Math.max(0, Math.min(100, Math.round(nextVolume)));
};

const normalizeSfx = (sfx = {}) => ({
  id: sfx?.id,
  resourceId: sfx?.resourceId,
  name: sfx?.name ?? "New Sound Effect",
  volume: normalizeVolume(sfx?.volume),
  loop: sfx?.loop ?? false,
});

const LOOP_OPTIONS = [
  { value: true, label: "Loop" },
  { value: false, label: "Don't Loop" },
];

export const createInitialState = () => ({
  mode: "current",
  items: { items: {}, tree: [] },
  /**
   * Array of sound effect objects with the following structure:
   * {
   *   id: string,           // Unique identifier for the sound effect
   *   resourceId: string,   // ID of the sound resource from repository
   *   name: string          // Display name for the sound effect
   * }
   */
  sfx: [],
  currentEditingId: null, // ID of sound effect being edited
  tempSelectedResourceId: undefined,
  searchQuery: "",
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
  // Dropdown menu state
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sfxId: null,
  },
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setRepositoryState = ({ state }, { sounds } = {}) => {
  state.items = sounds;
};

export const setTempSelectedResourceId = ({ state }, { resourceId } = {}) => {
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

export const addSfx = ({ state }, { id } = {}) => {
  const newSfx = normalizeSfx({
    id,
    resourceId: null,
  });
  state.sfx.push(newSfx);
  state.currentEditingId = newSfx.id;
};

export const setExistingSfxs = ({ state }, { sfx = [] } = {}) => {
  state.sfx = sfx.map((item) => normalizeSfx(item));
};

export const updateSfx = ({ state }, updates = {}) => {
  const index = state.sfx.findIndex((se) => se.id === updates.id);
  if (index !== -1) {
    state.sfx[index] = normalizeSfx({
      ...state.sfx[index],
      ...updates,
    });
  }
};

export const deleteSfx = ({ state }, { id } = {}) => {
  state.sfx = state.sfx.filter((se) => se.id !== id);
  if (state.currentEditingId === id) {
    state.currentEditingId = null;
  }
};

export const setCurrentEditingId = ({ state }, { id } = {}) => {
  state.currentEditingId = id;
};

export const showDropdownMenu = ({ state }, { position, sfxId } = {}) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    sfxId,
    items: [
      {
        label: "Delete",
        type: "item",
        value: "delete",
      },
    ],
  };
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    sfxId: null,
  };
};

export const selectDropdownMenuSfxId = ({ state }) => {
  return state.dropdownMenu.sfxId;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const selectCurrentEditingSfx = ({ state }) => {
  return state.sfx.find((se) => se.id === state.currentEditingId);
};

export const selectSfxs = ({ state }) => {
  return state.sfx;
};

export const selectCurrentEditingId = ({ state }) => {
  return state.currentEditingId;
};

export const selectSoundItemById = ({ state }, { itemId } = {}) => {
  return toFlatItems(state.items).find((item) => item.id === itemId);
};

export const selectSfxWithSoundData = ({ state }) => {
  const flatSoundItems = toFlatItems(state.items);

  return state.sfx.map((sfx) => {
    const soundItem = flatSoundItems.find((item) => item.id === sfx.resourceId);
    return {
      ...sfx,
      name: soundItem?.name,
      fileId: soundItem?.fileId,
      waveformDataFileId: soundItem?.waveformDataFileId,
      itemBorderColor: "bo",
      itemHoverBorderColor: "ac",
    };
  });
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

  const breadcrumb = selectBreadcrumb({ state });
  const sfxWithSoundData = selectSfxWithSoundData({ state });

  // Create default values with sound effects data
  const defaultValues = {
    sfx: sfxWithSoundData,
  };

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    sfx: sfxWithSoundData,
    tempSelectedResourceId: state.tempSelectedResourceId,
    searchQuery: state.searchQuery,
    searchPlaceholder: "Search...",
    playingSound: state.playingSound,
    showAudioPlayer: state.showAudioPlayer,
    breadcrumb,
    loopOptions: LOOP_OPTIONS,
    defaultValues,
    dropdownMenu: state.dropdownMenu,
  };
};
