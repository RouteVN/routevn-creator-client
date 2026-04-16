export const createInitialState = () => ({
  defaultValues: {},

  form: {
    fields: [
      {
        name: "placeholder",
        type: "read-only-text",
        label: "Toggle Dialogue Box Visibility Action",
        description: "This action will show or hide the dialogue box",
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
      label: "Toggle Dialogue Box Visibility",
    },
  ];

  return {
    submitDisabled: false,
    breadcrumb,
    form: state.form,
    defaultValues: state.defaultValues,
  };
};
