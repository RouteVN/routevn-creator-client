const getLayoutTypeByMode = (mode) => {
  return mode === "nvl" ? "dialogue-nvl" : "dialogue-adv";
};

const getLayoutOptions = ({ layouts, mode } = {}) => {
  const layoutType = getLayoutTypeByMode(mode);
  return (layouts ?? [])
    .filter((layout) => layout.layoutType === layoutType)
    .map((layout) => ({
      value: layout.id,
      label: layout.name,
    }));
};

const resolveSelectedResourceId = ({ layoutOptions, resourceId } = {}) => {
  if (
    resourceId &&
    layoutOptions.some((layoutOption) => layoutOption.value === resourceId)
  ) {
    return resourceId;
  }

  return layoutOptions[0]?.value ?? "";
};

const toBoolean = (value) => {
  return value === true || value === "true";
};

export const createInitialState = () => ({
  layouts: [],
  selectedResourceId: "",
  characters: [],
  selectedCharacterId: "",
  customCharacterName: false,
  characterName: "",
  selectedMode: "adv",
  persistCharacter: false,
  clearPage: false,

  defaultValues: {
    mode: "adv",
    resourceId: "",
    characterId: "",
    customCharacterName: false,
    characterName: "",
    persistCharacter: false,
    clearPage: false,
  },

  form: {
    fields: [
      {
        name: "mode",
        type: "segmented-control",
        label: "Dialogue Mode",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: "adv", label: "ADV" },
          { value: "nvl", label: "NVL" },
        ],
      },
      {
        name: "resourceId",
        type: "select",
        label: "Dialogue Layout",
        description: "",
        required: true,
        clearable: false,
        placeholder: "Choose a layout...",
        options: [],
      },
      {
        name: "characterId",
        type: "select",
        label: "Dialogue Character",
        description: "",
        required: false,
        placeholder: "Choose a character...",
        options: [],
      },
      {
        name: "customCharacterName",
        type: "segmented-control",
        label: "Custom Character Name",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        $when: "values.customCharacterName == true",
        name: "characterName",
        type: "input-text",
        label: "Character Name",
        description: "",
        required: true,
        placeholder: "Enter character name",
      },
      {
        $when: "values.characterId || values.customCharacterName",
        name: "persistCharacter",
        type: "segmented-control",
        label: "Persist Character",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        $when: 'values.mode == "nvl"',
        name: "clearPage",
        type: "segmented-control",
        label: "Clear Page",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  },
});

export const setLayouts = ({ state }, { layouts } = {}) => {
  state.layouts = layouts;
};

export const setSelectedResource = ({ state }, { resourceId } = {}) => {
  state.selectedResourceId = resourceId;
  state.defaultValues.resourceId = resourceId;
};

export const setSelectedCharacterId = ({ state }, { characterId } = {}) => {
  state.selectedCharacterId = characterId;
  state.defaultValues.characterId = characterId;
};

export const setCustomCharacterName = (
  { state },
  { customCharacterName } = {},
) => {
  const customCharacterNameValue = toBoolean(customCharacterName);
  state.customCharacterName = customCharacterNameValue;
  state.defaultValues.customCharacterName = customCharacterNameValue;
};

export const setCharacterName = ({ state }, { characterName } = {}) => {
  const nextCharacterName = characterName ?? "";
  state.characterName = nextCharacterName;
  state.defaultValues.characterName = nextCharacterName;
};

export const setSelectedMode = ({ state }, { mode } = {}) => {
  const selectedMode = mode === "nvl" ? "nvl" : "adv";
  state.selectedMode = selectedMode;
  state.defaultValues.mode = selectedMode;
};

export const setPersistCharacter = ({ state }, { persistCharacter } = {}) => {
  const persistCharacterValue = toBoolean(persistCharacter);
  state.persistCharacter = persistCharacterValue;
  state.defaultValues.persistCharacter = persistCharacterValue;
};

export const setClearPage = ({ state }, { clearPage } = {}) => {
  const clearPageValue = toBoolean(clearPage);
  state.clearPage = clearPageValue;
  state.defaultValues.clearPage = clearPageValue;
};

export const selectViewData = ({ state, props }) => {
  const layouts = props.layouts || [];
  const characters = props.characters || [];
  const selectedMode = state.selectedMode || "adv";
  const layoutOptions = getLayoutOptions({
    layouts,
    mode: selectedMode,
  });
  const selectedResourceId = resolveSelectedResourceId({
    layoutOptions,
    resourceId: state.selectedResourceId,
  });

  const characterOptions = characters
    .filter((character) => character.type === "character")
    .map((character) => ({
      value: character.id,
      label: character.name,
    }));

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Dialogue Box",
    },
  ];

  // Update form options with current data
  const form = {
    ...state.form,
    fields: state.form.fields.map((field) => {
      if (field.name === "mode") {
        return {
          ...field,
          value: selectedMode,
        };
      }
      if (field.name === "resourceId") {
        return {
          ...field,
          options: layoutOptions,
          value: selectedResourceId,
          label:
            selectedMode === "nvl"
              ? "Dialogue NVL Layout"
              : "Dialogue ADV Layout",
        };
      }
      if (field.name === "characterId") {
        return {
          ...field,
          options: characterOptions,
          value: state.selectedCharacterId,
        };
      }
      if (field.name === "customCharacterName") {
        return {
          ...field,
          value: state.customCharacterName,
        };
      }
      if (field.name === "characterName") {
        return {
          ...field,
          value: state.characterName,
        };
      }
      if (field.name === "persistCharacter") {
        return {
          ...field,
          value: state.persistCharacter,
        };
      }
      if (field.name === "clearPage") {
        return {
          ...field,
          value: state.clearPage,
        };
      }
      return field;
    }),
  };

  // Update default values with current selections
  const defaultValues = {
    mode: selectedMode,
    resourceId: selectedResourceId,
    characterId: state.selectedCharacterId,
    customCharacterName: state.customCharacterName,
    characterName: state.characterName,
    persistCharacter: state.persistCharacter,
    clearPage: state.clearPage,
  };

  const context = {
    values: defaultValues,
  };

  return {
    layouts: layoutOptions,
    characters: characterOptions,
    selectedResourceId,
    selectedCharacterId: state.selectedCharacterId,
    customCharacterName: state.customCharacterName,
    characterName: state.characterName,
    selectedMode,
    persistCharacter: state.persistCharacter,
    clearPage: state.clearPage,
    submitDisabled: !selectedResourceId,
    breadcrumb,
    form,
    defaultValues,
    context,
  };
};
