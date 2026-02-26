import { toFlatGroups, toFlatItems } from "#domain-structure";

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

const form = {
  fields: [
    {
      type: "slot",
      slot: "sfx",
      description: "Sound Effects",
    },
  ],
};

export const setRepositoryState = ({ state }, { sounds } = {}) => {
  state.items = sounds;
};

export const setTempSelectedResourceId = ({ state }, { resourceId } = {}) => {
  state.tempSelectedResourceId = resourceId;
};

export const addSfx = ({ state }, { id } = {}) => {
  const newSfx = {
    id,
    resourceId: null,
    name: "New Sound Effect",
    volume: 500,
  };
  state.sfx.push(newSfx);
  state.currentEditingId = newSfx.id;
};

export const setExistingSfxs = ({ state }, { sfx = [] } = {}) => {
  state.sfx = sfx.map((item) => ({
    volume: 500,
    ...item,
  }));
};

export const updateSfx = ({ state }, updates = {}) => {
  const index = state.sfx.findIndex((se) => se.id === updates.id);
  if (index !== -1) {
    state.sfx[index] = { ...state.sfx[index], ...updates };
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

export const selectSfxWithSoundData = ({ state }) => {
  const flatSoundItems = toFlatItems(state.items);

  return state.sfx.map((sfx) => {
    const soundItem = flatSoundItems.find((item) => item.id === sfx.resourceId);
    return {
      ...sfx,
      name: soundItem?.name,
      waveformDataFileId: soundItem?.waveformDataFileId,
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
  const flatGroups = toFlatGroups(state.items).map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === state.tempSelectedResourceId;
        return {
          ...child,
          bw: isSelected ? "md" : "",
          bc: isSelected ? "fg" : "",
          waveformDataFileId: child.waveformDataFileId,
        };
      }),
    };
  });

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
    breadcrumb,
    form,
    defaultValues,
    dropdownMenu: state.dropdownMenu,
  };
};
