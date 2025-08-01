import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  /**
   * Array of sound effect objects with the following structure:
   * {
   *   id: string,           // Unique identifier for the sound effect
   *   resourceId: string,   // ID of the audio resource from repository
   *   resourceType: "audio", // Type of resource (always "audio")
   *   name: string         // Display name for the sound effect
   * }
   */
  soundEffects: [],
  currentEditingId: null, // ID of sound effect being edited
  tempSelectedResourceId: undefined,
  // Dropdown menu state
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    soundEffectId: null,
  },
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

const form = {
  fields: [
    {
      inputType: "slot",
      slot: "sound-effects",
      description: "Sound Effects",
    },
  ],
};

export const setRepositoryState = (state, payload) => {
  state.items = payload.audio;
};

export const setTempSelectedResourceId = (state, payload) => {
  state.tempSelectedResourceId = payload.resourceId;
};

export const addSoundEffect = (state, payload) => {
  const newSoundEffect = {
    id: payload.id,
    resourceId: null,
    resourceType: "audio",
    name: "New Sound Effect",
  };
  state.soundEffects.push(newSoundEffect);
  state.currentEditingId = newSoundEffect.id;
};

export const setExistingSoundEffects = (state, payload) => {
  state.soundEffects = payload.soundEffects;
};


export const updateSoundEffect = (state, payload) => {
  const index = state.soundEffects.findIndex((se) => se.id === payload.id);
  if (index !== -1) {
    state.soundEffects[index] = { ...state.soundEffects[index], ...payload };
  }
};

export const deleteSoundEffect = (state, payload) => {
  state.soundEffects = state.soundEffects.filter((se) => se.id !== payload.id);
  if (state.currentEditingId === payload.id) {
    state.currentEditingId = null;
  }
};

export const setCurrentEditingId = (state, payload) => {
  state.currentEditingId = payload.id;
};

export const showDropdownMenu = (state, { position, soundEffectId }) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    soundEffectId,
    items: [
      {
        label: "Delete",
        type: "item",
        value: "delete",
      },
    ],
  };
};

export const hideDropdownMenu = (state) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    soundEffectId: null,
  };
};

export const selectDropdownMenuSoundEffectId = ({ state }) => {
  return state.dropdownMenu.soundEffectId;
};

export const selectTempSelectedResourceId = ({ state }) => {
  return state.tempSelectedResourceId;
};

export const selectCurrentEditingSoundEffect = ({ state }) => {
  return state.soundEffects.find((se) => se.id === state.currentEditingId);
};

export const selectSoundEffects = ({ state }) => {
  return state.soundEffects;
};

export const selectCurrentEditingId = ({ state }) => {
  return state.currentEditingId;
};


export const selectSoundEffectsWithAudioData = ({ state }) => {
  const flatAudioItems = toFlatItems(state.items);

  return state.soundEffects.map((sfx) => {
    const audioItem = flatAudioItems.find((item) => item.id === sfx.resourceId);
    return {
      ...sfx,
      name: audioItem?.name,
      waveformDataFileId: audioItem?.waveformDataFileId,
    };
  });
};

export const selectBreadcrumb = ({ state }) => {
  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
  ];

  if (state.mode === "gallery") {
    breadcrumb.push({
      id: "current",
      label: "Sound Effects",
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

export const toViewData = ({ state, props }) => {
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
          selectedStyle: isSelected
            ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
            : "",
          waveformDataFileId: child.waveformDataFileId,
        };
      }),
    };
  });

  const breadcrumb = selectBreadcrumb({ state });
  const soundEffectsWithAudioData = selectSoundEffectsWithAudioData({ state });

  // Create default values with sound effects data
  const defaultValues = {
    soundEffects: soundEffectsWithAudioData,
  };

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    soundEffects: soundEffectsWithAudioData,
    tempSelectedResourceId: state.tempSelectedResourceId,
    breadcrumb,
    form,
    defaultValues,
    dropdownMenu: state.dropdownMenu,
  };
};
