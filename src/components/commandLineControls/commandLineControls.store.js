export const INITIAL_STATE = Object.freeze({
  disableUserClick: false,
  autoPlay: false,
  autoPlayDelay: 1000,

  defaultValues: {
    disableUserClick: false,
    autoPlay: false,
    autoPlayDelay: 1000,
  },

  form: {
    fields: [
      {
        name: "disableUserClick",
        inputType: "select",
        label: "Disable User Click",
        description: "",
        required: false,
        placeholder: "Select option...",
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        name: "autoPlay",
        inputType: "select",
        label: "Auto Play",
        description: "",
        required: false,
        placeholder: "Select option...",
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        name: "autoPlayDelay",
        inputType: "inputNumber",
        label: "Auto Play Delay (milliseconds)",
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

export const setDisableUserClick = (state, { disableUserClick }) => {
  state.disableUserClick = disableUserClick;
  state.defaultValues.disableUserClick = disableUserClick;
};

export const setAutoPlay = (state, { autoPlay }) => {
  state.autoPlay = autoPlay;
  state.defaultValues.autoPlay = autoPlay;
};

export const setAutoPlayDelay = (state, { autoPlayDelay }) => {
  state.autoPlayDelay = autoPlayDelay;
  state.defaultValues.autoPlayDelay = autoPlayDelay;
};

export const toViewData = ({ state, props }, payload) => {
  const booleanOptions = [
    { value: false, label: "No" },
    { value: true, label: "Yes" },
  ];

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
    {
      id: "current",
      label: "Controls",
    },
  ];

  // Update form fields with current values
  const form = {
    ...state.form,
    fields: state.form.fields.map(field => {
      if (field.name === 'disableUserClick') {
        return { ...field, value: state.disableUserClick };
      }
      if (field.name === 'autoPlay') {
        return { ...field, value: state.autoPlay };
      }
      if (field.name === 'autoPlayDelay') {
        return { ...field, value: state.autoPlayDelay };
      }
      return field;
    })
  };

  // Update default values with current selections
  const defaultValues = {
    disableUserClick: state.disableUserClick,
    autoPlay: state.autoPlay,
    autoPlayDelay: state.autoPlayDelay,
  };

  return {
    breadcrumb,
    booleanOptions,
    disableUserClick: state.disableUserClick,
    autoPlay: state.autoPlay,
    autoPlayDelay: state.autoPlayDelay,
    submitDisabled: false,
    form,
    defaultValues,
  };
};
