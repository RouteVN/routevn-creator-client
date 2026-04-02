const INHERIT_TO_CHILDREN_OPTIONS = [
  { label: "Disabled", value: false },
  { label: "Enabled", value: true },
];

export const getChildInteractionSummary = (values = {}) => {
  const labels = [];

  if (values?.hover?.inheritToChildren === true) {
    labels.push("Hover");
  }

  if (values?.click?.inheritToChildren === true) {
    labels.push("Click");
  }

  if (values?.rightClick?.inheritToChildren === true) {
    labels.push("Right Click");
  }

  if (labels.length === 0) {
    return "None";
  }

  return labels.join(", ");
};

export const createChildInteractionDialogDefaults = (values = {}) => {
  return {
    hover: {
      inheritToChildren: values?.hover?.inheritToChildren === true,
    },
    click: {
      inheritToChildren: values?.click?.inheritToChildren === true,
    },
    rightClick: {
      inheritToChildren: values?.rightClick?.inheritToChildren === true,
    },
  };
};

export const createChildInteractionForm = () => {
  return {
    title: "Child Interaction",
    fields: [
      {
        name: "hover.inheritToChildren",
        type: "select",
        label: "Hover",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
      {
        name: "click.inheritToChildren",
        type: "select",
        label: "Click",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
      {
        name: "rightClick.inheritToChildren",
        type: "select",
        label: "Right Click",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: "Save",
        },
      ],
    },
  };
};
