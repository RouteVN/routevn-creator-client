export const createInitialState = () => ({
  defaultValues: {
    offset: -1,
  },
  form: {
    fields: [
      {
        name: "offset",
        type: "input-number",
        label: "Rollback Offset",
        description: "Use a negative number to go back by that many lines",
        required: true,
        max: -1,
        placeholder: "-1",
      },
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  },
});

export const setDefaultValues = ({ state }, payload = {}) => {
  state.defaultValues = {
    ...state.defaultValues,
    ...payload,
  };
};

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
};

export const selectViewData = ({ state }) => {
  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Rollback",
    },
  ];

  return {
    breadcrumb,
    form: state.form,
    defaultValues: state.defaultValues,
  };
};
