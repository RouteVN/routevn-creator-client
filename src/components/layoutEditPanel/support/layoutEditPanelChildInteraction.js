const INHERIT_TO_CHILDREN_OPTIONS = [
  { label: "Disabled", value: false },
  { label: "Enabled", value: true },
];
const CHILD_INTERACTION_ITEMS = [
  { label: "Hover", key: "hover", name: "hover.inheritToChildren" },
  { label: "Click", key: "click", name: "click.inheritToChildren" },
  {
    label: "Right Click",
    key: "rightClick",
    name: "rightClick.inheritToChildren",
  },
];

const isChildInteractionEnabled = (values = {}, key) => {
  return values?.[key]?.inheritToChildren === true;
};

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

export const hasChildInteractionInheritance = (values = {}) => {
  return CHILD_INTERACTION_ITEMS.some((item) =>
    isChildInteractionEnabled(values, item.key),
  );
};

export const getChildInteractionItems = (values = {}) => {
  return CHILD_INTERACTION_ITEMS.filter((item) =>
    isChildInteractionEnabled(values, item.key),
  );
};

export const getAvailableChildInteractionItems = (values = {}) => {
  return CHILD_INTERACTION_ITEMS.filter(
    (item) => !isChildInteractionEnabled(values, item.key),
  );
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
        type: "segmented-control",
        label: "Hover",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
      {
        name: "click.inheritToChildren",
        type: "segmented-control",
        label: "Click",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
      {
        name: "rightClick.inheritToChildren",
        type: "segmented-control",
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
