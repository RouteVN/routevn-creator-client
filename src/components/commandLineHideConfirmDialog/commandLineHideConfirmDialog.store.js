export const createInitialState = () => ({
  defaultValues: {},
  form: {
    fields: [
      {
        name: "placeholder",
        type: "read-only-text",
        label: "Hide Confirm Dialog",
        description: "This action hides the current confirm dialog",
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
      label: "Hide Confirm Dialog",
    },
  ];

  return {
    breadcrumb,
    form: state.form,
    defaultValues: state.defaultValues,
  };
};
