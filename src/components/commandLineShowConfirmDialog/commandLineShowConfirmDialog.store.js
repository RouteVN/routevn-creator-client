const form = {
  fields: [
    {
      name: "resourceId",
      type: "select",
      label: "Confirm Dialog Layout",
      description: "Select which confirm dialog layout to show",
      required: true,
      clearable: false,
      placeholder: "Choose a layout",
      options: "${layoutOptions}",
    },
  ],
  actions: {
    layout: "",
    buttons: [],
  },
};

const toLayoutOptions = (layouts = []) => {
  return (layouts || [])
    .filter((layout) => layout.layoutType === "confirmDialog")
    .map((layout) => ({
      value: layout.id,
      label: layout.name,
    }));
};

const resolveSelectedResourceId = ({
  layoutOptions,
  selectedResourceId,
} = {}) => {
  if (
    selectedResourceId &&
    layoutOptions.some((layout) => layout.value === selectedResourceId)
  ) {
    return selectedResourceId;
  }

  return layoutOptions[0]?.value ?? "";
};

const countActions = (actions = {}) => {
  return Object.keys(actions || {}).length;
};

export const createInitialState = () => ({
  mode: "current",
  selectedResourceId: "",
  confirmActions: {},
  cancelActions: {},
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setSelectedResourceId = ({ state }, { resourceId } = {}) => {
  state.selectedResourceId = resourceId ?? "";
};

export const setConfirmActions = ({ state }, { actions } = {}) => {
  state.confirmActions =
    actions && typeof actions === "object" && !Array.isArray(actions)
      ? { ...actions }
      : {};
};

export const setCancelActions = ({ state }, { actions } = {}) => {
  state.cancelActions =
    actions && typeof actions === "object" && !Array.isArray(actions)
      ? { ...actions }
      : {};
};

export const selectViewData = ({ state, props }) => {
  const layoutOptions = toLayoutOptions(props.layouts);
  const selectedResourceId = resolveSelectedResourceId({
    layoutOptions,
    selectedResourceId: state.selectedResourceId,
  });
  const confirmActionCount = countActions(state.confirmActions);
  const cancelActionCount = countActions(state.cancelActions);

  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      id: "current",
      label: "Show Confirm Dialog",
      click: state.mode !== "current",
    },
    ...(state.mode === "confirmActions"
      ? [{ label: "Confirm Actions" }]
      : state.mode === "cancelActions"
        ? [{ label: "Cancel Actions" }]
        : []),
  ];

  return {
    mode: state.mode,
    breadcrumb,
    form,
    context: {
      layoutOptions,
    },
    defaultValues: {
      resourceId: selectedResourceId,
    },
    selectedResourceId,
    submitDisabled: !selectedResourceId,
    confirmActions: state.confirmActions,
    cancelActions: state.cancelActions,
    confirmActionsSummary:
      confirmActionCount > 0 ? `${confirmActionCount} action(s)` : "No actions",
    cancelActionsSummary:
      cancelActionCount > 0
        ? `${cancelActionCount} action(s)`
        : "Default hide only",
    nestedHiddenModes: ["showConfirmDialog", "hideConfirmDialog"],
  };
};
