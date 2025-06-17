export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  
  defaultValues: {
    name: '',
    hex: '#ff0000',
  },

  form: {
    title: 'Add Color',
    description: 'Create a new color',
    fields: [{
      id: 'name',
      fieldName: 'name',
      inputType: 'inputText',
      label: 'Name',
      description: 'Enter the color name',
      required: true,
    }, {
      id: 'hex',
      fieldName: 'hex',
      inputType: 'inputText',
      label: 'Hex Value',
      description: 'Enter the hex color value (e.g., #ff0000)',
      required: true,
    }],
    actions: {
      layout: '',
      buttons: [{
        id: 'submit',
        variant: 'pr',
        content: 'Add Color',
      }],
    }
  }
});

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
}

export const toggleDialog = (state) => {
  state.isDialogOpen = !state.isDialogOpen;
}

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
}

export const toViewData = ({ state, props }) => {
  const selectedItemId = props.selectedItemId;
  
  // Apply collapsed state to flatGroups
  const flatGroups = (props.flatGroups || []).map(group => ({
    ...group,
    isCollapsed: state.collapsedIds.includes(group.id),
    children: state.collapsedIds.includes(group.id) ? [] : (group.children || []).map(item => ({
      ...item,
      selectedStyle: item.id === selectedItemId ? 
        "outline: 2px solid var(--color-pr); outline-offset: 2px;" : ""
    }))
  }));

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    uploadText: "Upload Color Files",
    isDialogOpen: state.isDialogOpen,
    defaultValues: state.defaultValues,
    form: state.form,
  };
};