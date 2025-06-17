export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  
  defaultValues: {
    name: '',
    fontSize: '16',
    fontColor: '#000000',
    fontWeight: 'normal',
  },

  form: {
    title: 'Add Typography',
    description: 'Create a new typography style',
    fields: [{
      id: 'name',
      fieldName: 'name',
      inputType: 'inputText',
      label: 'Name',
      description: 'Enter the typography style name',
      required: true,
    }, {
      id: 'fontSize',
      fieldName: 'fontSize',
      inputType: 'inputText',
      label: 'Font Size',
      description: 'Enter the font size (e.g., 16, 18, 24)',
      required: true,
    }, {
      id: 'fontColor',
      fieldName: 'fontColor',
      inputType: 'inputText',
      label: 'Font Color',
      description: 'Enter the font color (e.g., #000000, #ff0000)',
      required: true,
    }, {
      id: 'fontWeight',
      fieldName: 'fontWeight',
      inputType: 'inputText',
      label: 'Font Weight',
      description: 'Enter the font weight (e.g., normal, bold, 400, 700)',
      required: true,
    }],
    actions: {
      layout: '',
      buttons: [{
        id: 'submit',
        variant: 'pr',
        content: 'Add Typography',
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
    uploadText: "Upload Typography Files",
    isDialogOpen: state.isDialogOpen,
    defaultValues: state.defaultValues,
    form: state.form,
  };
};