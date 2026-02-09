export const createInitialState = () => ({
  defaultValues: {
    manualEnabled: true,
    // manualRequireLineCompleted: false, // Not yet implemented in route-engine
    autoEnabled: false,
    autoTrigger: "fromComplete",
    autoDelay: 1000,
  },

  form: {
    fields: [
      {
        name: "manualEnabled",
        inputType: "select",
        label: "Click to Advance",
        description: "",
        required: false,
        tooltip: {
          content:
            "When enabled, the player can click to advance to the next line",
        },
        options: [
          { value: true, label: "Yes" },
          { value: false, label: "No" },
        ],
      },
      // Not yet implemented in route-engine
      // {
      //   $when: `values.manualEnabled == true`,
      //   name: "manualRequireLineCompleted",
      //   inputType: "select",
      //   label: "Require Line Complete",
      //   description: "",
      //   required: false,
      //   tooltip: {
      //     content:
      //       "If yes, clicking during animation completes the text first, requiring a second click to advance. If no, clicking advances immediately, skipping any ongoing animation",
      //   },
      //   options: [
      //     { value: false, label: "No" },
      //     { value: true, label: "Yes" },
      //   ],
      // },
      {
        name: "autoEnabled",
        inputType: "select",
        label: "Auto Advance",
        description: "",
        required: false,
        tooltip: {
          content:
            "When enabled, the game will automatically advance to the next line after a delay",
        },
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        $when: `values.autoEnabled == true`,
        name: "autoTrigger",
        inputType: "select",
        label: "Timer Start",
        description: "",
        required: false,
        tooltip: {
          content:
            "When the auto-advance timer starts counting. 'Text Complete' waits for the text animation to finish first. 'Line Start' starts the timer immediately when the line begins",
        },
        options: [
          { value: "fromComplete", label: "Text Complete" },
          { value: "fromStart", label: "Line Start" },
        ],
      },
      {
        $when: `values.autoEnabled == true`,
        name: "autoDelay",
        inputType: "input-number",
        label: "Delay (ms)",
        description: "",
        required: false,
        tooltip: {
          content:
            "Time in milliseconds to wait before auto-advancing to the next line",
        },
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

  const context = {
    values: state.defaultValues,
  };

  // Key changes when visibility-affecting values change, forcing form to re-init
  const formKey = `${state.defaultValues.manualEnabled}-${state.defaultValues.autoEnabled}`;

  return {
    breadcrumb,
    form: state.form,
    defaultValues: state.defaultValues,
    context,
    formKey,
  };
};

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
};
