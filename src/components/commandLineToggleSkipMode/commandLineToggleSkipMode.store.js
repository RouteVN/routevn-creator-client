export const createInitialState = () => ({
  defaultValues: {},

  form: {
    fields: [
      {
        name: "placeholder",
        type: "read-only-text",
        label: "Toggle Skip Mode Action",
        description: "This action will toggle skip mode on/off",
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
      label: "Toggle Skip Mode",
    },
  ];

  return {
    submitDisabled: false,
    breadcrumb,
    form: state.form,
    defaultValues: state.defaultValues,
  };
};
