export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  searchQuery: '',
  isDialogOpen: false,
  targetGroupId: null,
  editMode: false,
  editItemId: null,

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
      id: 'x',
      fieldName: 'x',
      inputType: 'inputText',
      label: 'Position X',
      description: 'Enter the X coordinate (e.g., 100, 50%)',
      required: true,
    }, {
      id: 'y',
      fieldName: 'y',
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

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
}

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
}

export const setEditMode = (state, editMode, itemId = null, itemData = null) => {
  state.editMode = editMode;
  state.editItemId = itemId;

  if (editMode && itemData) {
    // Update form for edit mode
    state.form.title = 'Edit Placement';
    state.form.description = 'Edit the placement configuration';
    state.form.actions.buttons[0].content = 'Update Placement';

    // Update default values with current item data
    state.defaultValues = {
      name: itemData.name || '',
      positionX: itemData.positionX || '0',
      positionY: itemData.positionY || '0',
      scale: itemData.scale || '1',
      anchor: itemData.anchor || 'center',
      rotation: itemData.rotation || '0',
    };
  } else {
    // Reset form for add mode
    state.form.title = 'Add Placement';
    state.form.description = 'Create a new placement configuration';
    state.form.actions.buttons[0].content = 'Add Placement';

    // Reset default values
    state.defaultValues = {
      name: '',
      positionX: '0',
      positionY: '0',
      scale: '1',
      anchor: 'center',
      rotation: '0',
    };
  }
}

export const toViewData = ({ state, props }) => {
  const selectedItemId = props.selectedItemId;
  const searchQuery = state.searchQuery.toLowerCase();

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;

    const name = (item.name || '').toLowerCase();
    const description = (item.description || '').toLowerCase();

    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  // Apply collapsed state and search filtering to flatGroups
  const flatGroups = (props.flatGroups || [])
    .map(group => {
      // Filter children based on search query
      const filteredChildren = (group.children || []).filter(matchesSearch);

      // Only show groups that have matching children or if there's no search query
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      return {
        ...group,
        isCollapsed: state.collapsedIds.includes(group.id),
        children: state.collapsedIds.includes(group.id) ? [] : filteredChildren.map(item => ({
          ...item,
          selectedStyle: item.id === selectedItemId ?
            "outline: 2px solid var(--color-pr); outline-offset: 2px;" : ""
        })),
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup
      };
    })
    .filter(group => group.shouldDisplay);

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    searchQuery: state.searchQuery,
    isDialogOpen: state.isDialogOpen,
    editMode: state.editMode,
    editItemId: state.editItemId,
    defaultValues: state.defaultValues,
    form: state.form,
  };
};
