export const createInitialState = () => ({
  layouts: [],
  selectedLayoutId: "",

  defaultValues: {
    resourceId: "",
  },

  form: {
    fields: [
      {
        name: "resourceId",
        type: "select",
        label: "Base Layout",
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

export const setLayouts = ({ state }, { layouts } = {}) => {
  state.layouts = layouts;
};

export const setSelectedResourceId = ({ state }, { resourceId } = {}) => {
  state.selectedLayoutId = resourceId;
  state.defaultValues.resourceId = resourceId;
};

export const selectViewData = ({ state, props }) => {
  const layouts = props.layouts || [];

  const layoutOptions = layouts
    .filter((layout) => layout.layoutType === "base")
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
      label: "Base",
    },
  ];

  // Update form options with current data
  const form = {
    ...state.form,
    fields: state.form.fields.map((field) => {
      if (field.name === "resourceId") {
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
    resourceId: state.selectedLayoutId,
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
