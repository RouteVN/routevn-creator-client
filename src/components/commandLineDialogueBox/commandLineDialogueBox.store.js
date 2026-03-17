const getLayoutTypeByMode = (mode) => {
  return mode === "nvl" ? "nvl" : "dialogue";
};

const toBoolean = (value) => {
  return value === true || value === "true";
};

export const createInitialState = () => ({
  layouts: [],
  selectedResourceId: "",
  characters: [],
  selectedCharacterId: "",
  selectedMode: "adv",
  clearPage: false,

  defaultValues: {
    mode: "adv",
    resourceId: "",
    characterId: "",
    clearPage: false,
  },

  form: {
    fields: [
      {
        name: "mode",
        type: "select",
        label: "Dialogue Mode",
        description: "",
        required: false,
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
        required: false,
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
        $when: 'values.mode == "nvl"',
        name: "clearPage",
        type: "select",
        label: "Clear Page",
        description: "",
        required: false,
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

export const setSelectedMode = ({ state }, { mode } = {}) => {
  const selectedMode = mode === "nvl" ? "nvl" : "adv";
  state.selectedMode = selectedMode;
  state.defaultValues.mode = selectedMode;
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
  const layoutType = getLayoutTypeByMode(selectedMode);

  const layoutOptions = layouts
    .filter((layout) => layout.layoutType === layoutType)
    .map((layout) => ({
      value: layout.id,
      label: layout.name,
    }));

  const selectedResourceId = layoutOptions.some(
    (layoutOption) => layoutOption.value === state.selectedResourceId,
  )
    ? state.selectedResourceId
    : "";

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
          label: selectedMode === "nvl" ? "NVL Layout" : "Dialogue Layout",
        };
      }
      if (field.name === "characterId") {
        return {
          ...field,
          options: characterOptions,
          value: state.selectedCharacterId,
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
    selectedMode,
    clearPage: state.clearPage,
    submitDisabled: false,
    breadcrumb,
    form,
    defaultValues,
    context,
  };
};
