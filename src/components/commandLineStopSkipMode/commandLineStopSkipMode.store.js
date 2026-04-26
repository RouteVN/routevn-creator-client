export const createInitialState = () => ({
  defaultValues: {},

  form: {
    fields: [
      {
        name: "placeholder",
        type: "read-only-text",
        label: "Stop Skip Mode Action",
        description: "This action will turn skip mode off",
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
  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Stop Skip Mode",
    },
  ];

  return {
    submitDisabled: false,
    breadcrumb,
    form: state.form,
    defaultValues: state.defaultValues,
  };
};
