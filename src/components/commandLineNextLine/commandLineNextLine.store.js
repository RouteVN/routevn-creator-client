export const createInitialState = () => ({
  defaultValues: {},

  form: {
    fields: [
      {
        name: "placeholder",
        type: "read-only-text",
        label: "Next Line Action",
        description: "This action will advance to the next line",
        required: false,
      },
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  },
});

export const selectViewData = ({ state }) => {
  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
    {
      label: "Next Line",
    },
  ];

  return {
    submitDisabled: false,
    breadcrumb,
    form: state.form,
    defaultValues: state.defaultValues,
  };
};
