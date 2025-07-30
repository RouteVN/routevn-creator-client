import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { nanoid } from "nanoid";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  soundEffects: [], // List of selected sound effects
  currentEditingId: null, // ID of sound effect being edited
  tempSelectedAudioId: undefined,
  context: {},
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

export const setContext = (state, context) => {
  state.context = context;
};

const createSoundEffectsForm = (soundEffects) => {
  const triggerOptions = [
    { label: "On Click", value: "click" },
    { label: "On Hover", value: "hover" },
    { label: "On Enter", value: "enter" },
    { label: "On Exit", value: "exit" },
    { label: "Manual", value: "manual" },
  ];

  const fields = [];

  // Create pairs of waveform + trigger fields for each sound effect
  soundEffects.forEach((effect, index) => {
    // Add waveform field
    fields.push({
      name: `sfx[${index}]`,
      label: `Sound Effect ${index + 1}`,
      inputType: "waveform",
      waveformData: "${sfx[" + index + "].waveformData}",
      width: 355,
      height: 150,
    });

    // Add trigger field immediately after
    fields.push({
      name: `sfx[${index}].trigger`,
      label: `Trigger ${index + 1}`,
      inputType: "select",
      options: triggerOptions,
    });
  });

  return {
    fields,
  };
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
          selectedStyle: isSelected
            ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
            : "",
          waveformDataFileId: child.waveformDataFileId,
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

  // Create form configuration
  const form = createSoundEffectsForm(state.soundEffects);

  // Create default values for form
  const defaultValues = {};
  state.soundEffects.forEach((effect, index) => {
    defaultValues[`sfx[${index}]`] = effect.fileId || "";
    defaultValues[`sfx[${index}].trigger`] = effect.trigger || "click";
  });

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    triggerOptions,
    soundEffects: state.soundEffects,
    breadcrumb,
    form,
    defaultValues,
    context: state.context,
  };
};
