export const createInitialState = () => ({
  defaultValues: {
    manualEnabled: true,
    manualRequireLineCompleted: false,
    autoEnabled: false,
    autoTrigger: "fromComplete",
    autoDelay: 1000,
  },

  form: {
    fields: [
      {
        name: "manualEnabled",
        inputType: "select",
        label: "Allow Click to Advance",
        description: "",
        required: false,
        options: [
          { value: true, label: "Yes" },
          { value: false, label: "No" },
        ],
      },
      {
        name: "manualRequireLineCompleted",
        inputType: "select",
        label: "Wait for Text to Finish",
        description: "",
        required: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        name: "autoEnabled",
        inputType: "select",
        label: "Auto Advance",
        description: "",
        required: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        name: "autoTrigger",
        inputType: "select",
        label: "Start Timer From",
        description: "",
        required: false,
        options: [
          { value: "fromComplete", label: "Text Complete" },
          { value: "fromStart", label: "Line Start" },
        ],
      },
      {
        name: "autoDelay",
        inputType: "inputText",
        label: "Delay (ms)",
        description: "",
        required: false,
        placeholder: "1000",
      },
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  },
});

export const setDefaultValues = (state, payload) => {
  state.defaultValues = {
    ...state.defaultValues,
    ...payload,
  };
};

export const selectViewData = ({ state }) => {
  const breadcrumb = [
    { id: "actions", label: "Actions" },
    { label: "Next Line Config" },
  ];

  return {
    breadcrumb,
    form: state.form,
    defaultValues: state.defaultValues,
  };
};

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
};
