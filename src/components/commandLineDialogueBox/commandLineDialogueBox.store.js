export const createInitialState = () => ({
  layouts: [],
  selectedLayoutId: "",
  characters: [],
  selectedCharacterId: "",

  defaultValues: {
    layoutId: "",
    characterId: "",
  },

  form: {
    fields: [
      {
        name: "layoutId",
        inputType: "select",
        label: "Dialogue Layout",
        description: "",
        required: false,
        placeholder: "Choose a layout...",
        options: [],
      },
      {
        name: "characterId",
        inputType: "select",
        label: "Dialogue Character",
        description: "",
        required: false,
        placeholder: "Choose a character...",
        options: [],
      },
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  },
});

export const setLayouts = (state, layouts) => {
  state.layouts = layouts;
};

export const setSelectedLayoutId = (state, { layoutId }) => {
  state.selectedLayoutId = layoutId;
  state.defaultValues.layoutId = layoutId;
};

export const setSelectedCharacterId = (state, { characterId }) => {
  state.selectedCharacterId = characterId;
  state.defaultValues.characterId = characterId;
};

export const selectViewData = ({ state, props }, payload) => {
  const layouts = props.layouts || [];
  const characters = props.characters || [];

  const layoutOptions = layouts
    .filter((layout) => layout.layoutType === "dialogue")
    .map((layout) => ({
      value: layout.id,
      label: layout.name,
    }));

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
    },
    {
      label: "Dialogue Box",
    },
  ];

  // Update form options with current data
  const form = {
    ...state.form,
    fields: state.form.fields.map((field) => {
      if (field.name === "layoutId") {
        return {
          ...field,
          options: layoutOptions,
          value: state.selectedLayoutId,
        };
      }
      if (field.name === "characterId") {
        return {
          ...field,
          options: characterOptions,
          value: state.selectedCharacterId,
        };
      }
      return field;
    }),
  };

  // Update default values with current selections
  const defaultValues = {
    layoutId: state.selectedLayoutId,
    characterId: state.selectedCharacterId,
  };

  return {
    layouts: layoutOptions,
    characters: characterOptions,
    selectedLayoutId: state.selectedLayoutId,
    selectedCharacterId: state.selectedCharacterId,
    submitDisabled: false,
    breadcrumb,
    form,
    defaultValues,
  };
};
