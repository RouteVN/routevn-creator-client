export const createInitialState = () => ({
  layouts: [],
  selectedLayoutId: "",

  defaultValues: {
    layoutId: "",
  },

  form: {
    fields: [
      {
        name: "layoutId",
        inputType: "select",
        label: "Screen Layout",
        description: "",
        required: false,
        placeholder: "Choose a layout...",
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

export const selectViewData = ({ state, props }) => {
  const layouts = props.layouts || [];

  const layoutOptions = layouts
    .filter((layout) => layout.layoutType === "screen")
    .map((layout) => ({
      value: layout.id,
      label: layout.name,
    }));

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
    {
      label: "Screen",
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
      return field;
    }),
  };

  // Update default values with current selections
  const defaultValues = {
    layoutId: state.selectedLayoutId,
  };

  return {
    layouts: layoutOptions,
    selectedLayoutId: state.selectedLayoutId,
    submitDisabled: false,
    breadcrumb,
    form,
    defaultValues,
  };
};
