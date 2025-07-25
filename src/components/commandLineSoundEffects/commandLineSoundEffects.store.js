import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { nanoid } from "nanoid";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  soundEffects: [], // List of selected sound effects
  currentEditingId: null, // ID of sound effect being edited
  tempSelectedAudioId: undefined,
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setItems = (state, payload) => {
  state.items = payload.items;
};

export const setTempSelectedAudioId = (state, payload) => {
  state.tempSelectedAudioId = payload.audioId;
};

export const selectTempSelectedAudioId = ({ state }) => {
  return state.tempSelectedAudioId;
};

export const addSoundEffect = (state) => {
  const newSoundEffect = {
    id: nanoid(),
    audioId: null,
    fileId: null,
    trigger: "click",
    name: "New Sound Effect",
  };
  state.soundEffects.push(newSoundEffect);
  state.currentEditingId = newSoundEffect.id;
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

export const selectCurrentEditingSoundEffect = ({ state }) => {
  return state.soundEffects.find((se) => se.id === state.currentEditingId);
};

export const setExistingSoundEffects = (state, payload) => {
  state.soundEffects = payload.soundEffects;
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.items).filter(
    (item) => item.type === "folder",
  );
  const flatGroups = toFlatGroups(state.items).map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === state.tempSelectedAudioId;
        return {
          ...child,
          bw: isSelected ? "md" : "",
        };
      }),
    };
  });

  const triggerOptions = [
    { label: "On Click", value: "click" },
    { label: "On Hover", value: "hover" },
    { label: "On Enter", value: "enter" },
    { label: "On Exit", value: "exit" },
    { label: "Manual", value: "manual" },
  ];

  let breadcrumb = [
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

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    triggerOptions,
    soundEffects: state.soundEffects,
    breadcrumb,
  };
};
