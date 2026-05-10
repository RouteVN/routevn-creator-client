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
  { label: "Scroll Up", key: "scrollUp", name: "scrollUp.inheritToChildren" },
  {
    label: "Scroll Down",
    key: "scrollDown",
    name: "scrollDown.inheritToChildren",
  },
];

const isChildInteractionEnabled = (values = {}, key) => {
  return values?.[key]?.inheritToChildren === true;
};

export const getChildInteractionSummary = (values = {}) => {
  const labels = [];

  CHILD_INTERACTION_ITEMS.forEach((item) => {
    if (isChildInteractionEnabled(values, item.key)) {
      labels.push(item.label);
    }
  });

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
    scrollUp: {
      inheritToChildren: values?.scrollUp?.inheritToChildren === true,
    },
    scrollDown: {
      inheritToChildren: values?.scrollDown?.inheritToChildren === true,
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
      {
        name: "scrollUp.inheritToChildren",
        type: "segmented-control",
        label: "Scroll Up",
        required: true,
        clearable: false,
        options: INHERIT_TO_CHILDREN_OPTIONS,
      },
      {
        name: "scrollDown.inheritToChildren",
        type: "segmented-control",
        label: "Scroll Down",
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
