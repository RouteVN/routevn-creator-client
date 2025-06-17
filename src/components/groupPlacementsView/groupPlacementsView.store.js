export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  isDialogOpen: false,
  targetGroupId: null,
  
  defaultValues: {
    name: '',
    positionX: '0',
    positionY: '0',
    scale: '1',
    anchor: 'center',
    rotation: '0',
  },

  form: {
    title: 'Add Placement',
    description: 'Create a new placement configuration',
    fields: [{
      id: 'name',
      fieldName: 'name',
      inputType: 'inputText',
      label: 'Name',
      description: 'Enter the placement name',
      required: true,
    }, {
      id: 'positionX',
      fieldName: 'positionX',
      inputType: 'inputText',
      label: 'Position X',
      description: 'Enter the X coordinate (e.g., 100, 50%)',
      required: true,
    }, {
      id: 'positionY',
      fieldName: 'positionY',
      inputType: 'inputText',
      label: 'Position Y',
      description: 'Enter the Y coordinate (e.g., 200, 25%)',
      required: true,
    }, {
      id: 'scale',
      fieldName: 'scale',
      inputType: 'inputText',
      label: 'Scale',
      description: 'Enter the scale factor (e.g., 1, 0.5, 2)',
      required: true,
    }, {
      id: 'anchor',
      fieldName: 'anchor',
      inputType: 'inputText',
      label: 'Anchor',
      description: 'Enter the anchor point (e.g., center, top-left, bottom-right)',
      required: true,
    }, {
      id: 'rotation',
      fieldName: 'rotation',
      inputType: 'inputText',
      label: 'Rotation',
      description: 'Enter the rotation in degrees (e.g., 0, 45, 180)',
      required: true,
    }],
    actions: {
      layout: '',
      buttons: [{
        id: 'submit',
        variant: 'pr',
        content: 'Add Placement',
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
    isDialogOpen: state.isDialogOpen,
    defaultValues: state.defaultValues,
    form: state.form,
  };
};