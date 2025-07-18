export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  searchQuery: '',
  isDialogOpen: false,
  targetGroupId: null,
  editMode: false,
  editItemId: null,

  defaultValues: {
    name: '',
    x: '0',
    y: '0',
    scale: '1',
    anchor: 'center-center',
    rotation: '0',
  },

  form: {
    title: 'Add Placement',
    description: 'Create a new placement configuration',
    fields: [
      {
        name: 'name',
        inputType: 'inputText',
        label: 'Name',
        description: 'Enter the placement name',
        required: true,
      },
      {
        name: 'x',
        inputType: 'slider-input',
        min: 0,
        max: 1920,
        step: 1,
        label: 'Position X',
        description: 'Enter the X coordinate (e.g., 100, 50%)',
        required: true,
      },
      {
        name: 'y',
        inputType: 'slider-input',
        min: 0,
        max: 1080,
        step: 1,
        label: 'Position Y',
        description: 'Enter the Y coordinate (e.g., 200, 25%)',
        required: true,
      },
      {
        name: 'scale',
        inputType: 'slider-input',
        min: 0.1,
        max: 3,
        step: 0.1,
        label: 'Scale',
        description: 'Enter the scale factor (e.g., 1, 0.5, 2)',
        required: true,
      },
      {
        name: 'anchor',
        inputType: 'select',
        label: 'Anchor',
        description: 'Enter the anchor point (e.g., center, top-left, bottom-right)',
        placeholder: 'Choose a anchor',
        options: [
          { id: 'tl', label: 'Top Left', value: 'top-left' },
          { id: 'tc', label: 'Top Center', value: 'top-center' },
          { id: 'tr', label: 'Top Right', value: 'top-right' },
          { id: 'cl', label: 'Center Left', value: 'center-left' },
          { id: 'cc', label: 'Center Center', value: 'center-center' },
          { id: 'cr', label: 'Center Right', value: 'center-right' },
          { id: 'bl', label: 'Bottom Left', value: 'bottom-left' },
          { id: 'bc', label: 'Bottom Center', value: 'bottom-center' },
          { id: 'br', label: 'Bottom Right', value: 'bottom-right' },
        ],
        required: true,
      },
      {
        name: 'rotation',
        inputType: 'slider-input',
        min: -360,
        max: 360,
        step: 1,
        label: 'Rotation',
        description: 'Enter the rotation in degrees (e.g., 0, 45, 180)',
        required: true,
      }
    ],
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

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
}

export const openPlacementFormDialog = (state, options = {}) => {
  const { editMode = false, itemId = null, itemData = null, targetGroupId = null } = options;

  // Set edit mode and update form accordingly
  state.editMode = editMode;
  state.editItemId = itemId;
  state.targetGroupId = targetGroupId;

  // Update form based on edit mode
  if (editMode) {
    state.form.title = 'Edit Placement';
    state.form.description = 'Edit the placement configuration';
    state.form.actions.buttons[0].content = 'Update Placement';
  } else {
    state.form.title = 'Add Placement';
    state.form.description = 'Create a new placement configuration';
    state.form.actions.buttons[0].content = 'Add Placement';
  }

  // Set default values based on item data
  if (itemData) {
    state.defaultValues = {
      name: itemData.name || '',
      x: String(itemData.x || '0'),
      y: String(itemData.y || '0'),
      scale: String(itemData.scale || '1'),
      anchor: itemData.anchor || 'center-center',
      rotation: String(itemData.rotation || '0'),
    };
  } else {
    state.defaultValues = {
      name: '',
      x: '0',
      y: '0',
      scale: '1',
      anchor: 'center-center',
      rotation: '0',
    };
  }

  // Open dialog
  state.isDialogOpen = true;
}

export const closePlacementFormDialog = (state) => {
  // Close dialog
  state.isDialogOpen = false;

  // Reset all form state
  state.editMode = false;
  state.editItemId = null;
  state.targetGroupId = null;

  // Reset default values
  state.defaultValues = {
    name: '',
    x: '0',
    y: '0',
    scale: '1',
    anchor: 'center-center',
    rotation: '0',
  };

  // Reset form to add mode
  state.form.title = 'Add Placement';
  state.form.description = 'Create a new placement configuration';
  state.form.actions.buttons[0].content = 'Add Placement';
}

export const selectTargetGroupId = ({ state }) => {
  return state.targetGroupId;
}

export const selectEditMode = ({ state }) => {
  return state.editMode;
}

export const selectEditItemId = ({ state }) => {
  return state.editItemId;
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
