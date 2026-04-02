const INHERIT_TO_CHILDREN_OPTIONS = [
  { label: "Disabled", value: false },
  { label: "Enabled", value: true },
];

export const getChildInteractionSummary = (values = {}) => {
  const labels = [];

  if (values?.inheritHoverToChildren === true) {
    labels.push("Hover");
  }

  if (values?.inheritClickToChildren === true) {
    labels.push("Click");
  }

  if (values?.inheritRightClickToChildren === true) {
    labels.push("Right Click");
  }

  if (labels.length === 0) {
    return "None";
  }

  return labels.join(", ");
};

export const createChildInteractionDialogDefaults = (values = {}) => {
  return {
    inheritHoverToChildren: values?.inheritHoverToChildren === true,
    inheritClickToChildren: values?.inheritClickToChildren === true,
    inheritRightClickToChildren: values?.inheritRightClickToChildren === true,
  };
};

export const createChildInteractionForm = () => {
  return {
    title: "Child Interaction",
    fields: [
      {
        name: "inheritHoverToChildren",
        type: "select",
        label: "Hover",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
      {
        name: "inheritClickToChildren",
        type: "select",
        label: "Click",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
      {
        name: "inheritRightClickToChildren",
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
