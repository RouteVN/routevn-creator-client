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

const createInheritToChildrenOptions = (copy = {}) => [
  { label: copy.disabledOption ?? "Disabled", value: false },
  { label: copy.enabledOption ?? "Enabled", value: true },
];

const getChildInteractionItemLabel = (item, copy = {}) => {
  const key = {
    hover: "hoverLabel",
    click: "clickLabel",
    rightClick: "rightClickLabel",
    scrollUp: "scrollUpLabel",
    scrollDown: "scrollDownLabel",
  }[item.key];
  return key ? (copy[key] ?? item.label) : item.label;
};

export const getChildInteractionSummary = (values = {}, copy = {}) => {
  const labels = [];

  CHILD_INTERACTION_ITEMS.forEach((item) => {
    if (isChildInteractionEnabled(values, item.key)) {
      labels.push(getChildInteractionItemLabel(item, copy));
    }
  });

  if (labels.length === 0) {
    return copy.noneOption ?? "None";
  }

  return labels.join(", ");
};

export const hasChildInteractionInheritance = (values = {}) => {
  return CHILD_INTERACTION_ITEMS.some((item) =>
    isChildInteractionEnabled(values, item.key),
  );
};

export const getChildInteractionItems = (values = {}, copy = {}) => {
  return CHILD_INTERACTION_ITEMS.filter((item) =>
    isChildInteractionEnabled(values, item.key),
  ).map((item) => ({
    ...item,
    label: getChildInteractionItemLabel(item, copy),
  }));
};

export const getAvailableChildInteractionItems = (values = {}, copy = {}) => {
  return CHILD_INTERACTION_ITEMS.filter(
    (item) => !isChildInteractionEnabled(values, item.key),
  ).map((item) => ({
    ...item,
    label: getChildInteractionItemLabel(item, copy),
  }));
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

export const createChildInteractionForm = (copy = {}) => {
  const options = createInheritToChildrenOptions(copy);
  return {
    title: copy.childInteractionTitle ?? "Child Interaction",
    fields: [
      {
        name: "hover.inheritToChildren",
        type: "segmented-control",
        label: copy.hoverLabel ?? "Hover",
        required: true,
        clearable: false,
        options,
      },
      {
        name: "click.inheritToChildren",
        type: "segmented-control",
        label: copy.clickLabel ?? "Click",
        required: true,
        clearable: false,
        options,
      },
      {
        name: "rightClick.inheritToChildren",
        type: "segmented-control",
        label: copy.rightClickLabel ?? "Right Click",
        required: true,
        clearable: false,
        options,
      },
      {
        name: "scrollUp.inheritToChildren",
        type: "segmented-control",
        label: copy.scrollUpLabel ?? "Scroll Up",
        required: true,
        clearable: false,
        options,
      },
      {
        name: "scrollDown.inheritToChildren",
        type: "segmented-control",
        label: copy.scrollDownLabel ?? "Scroll Down",
        required: true,
        clearable: false,
        options,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: copy.cancelButton ?? "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: copy.saveButton ?? "Save",
        },
      ],
    },
  };
};
