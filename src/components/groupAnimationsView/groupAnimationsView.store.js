export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  searchQuery: "",

  defaultValues: {
    name: "",
  },

  form: {
    title: "Add Animation",
    description: "Create a new animation",
    fields: [
      {
        id: "name",
        fieldName: "name",
        inputType: "inputText",
        label: "Name",
        description: "Enter the animation name",
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          content: "Add Animation",
        },
      ],
    },
  },
});

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const toggleDialog = (state) => {
  state.isDialogOpen = !state.isDialogOpen;
};

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
};

export const toViewData = ({ state, props }) => {
  const selectedItemId = props.selectedItemId;

  // Apply collapsed state to flatGroups
  const flatGroups = (props.flatGroups || []).map((group) => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id)
      ? []
      : (group.children || []).map((item) => ({
          ...item,
          selectedStyle:
            item.id === selectedItemId
              ? "outline: 2px solid var(--color-pr); outline-offset: 2px;"
              : "",
        })),
  }));

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    isDialogOpen: state.isDialogOpen,
    defaultValues: state.defaultValues,
    form: state.form,
  };
};
