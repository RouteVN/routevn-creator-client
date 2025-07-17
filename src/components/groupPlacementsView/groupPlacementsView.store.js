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
        fieldName: 'name',
        inputType: 'inputText',
        label: 'Name',
        description: 'Enter the placement name',
        required: true,
      },
      {
        name: 'x',
        fieldName: 'x',
        inputType: 'inputText',
        label: 'Position X',
        description: 'Enter the X coordinate (e.g., 100, 50%)',
        required: true,
      },
      {
        name: 'y',
        fieldName: 'y',
        inputType: 'inputText',
        label: 'Position Y',
        description: 'Enter the Y coordinate (e.g., 200, 25%)',
        required: true,
      },
      {
        name: 'scale',
        fieldName: 'scale',
        inputType: 'inputText',
        label: 'Scale',
        description: 'Enter the scale factor (e.g., 1, 0.5, 2)',
        required: true,
      },
      {
        name: 'anchor',
        fieldName: 'anchor',
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
        fieldName: 'rotation',
        inputType: 'inputText',
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

export const toggleDialog = (state) => {
  state.isDialogOpen = !state.isDialogOpen;
}

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
}

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
}

export const setEditMode = (state, config) => {
  console.log('[setEditMode] Called with:', config);
  const { editMode, itemId, itemData } = config;

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
      x: String(itemData.x || '0'),
      y: String(itemData.y || '0'),
      scale: String(itemData.scale || '1'),
      anchor: itemData.anchor || 'center-center',
      rotation: String(itemData.rotation || '0'),
    };

    console.log('[setEditMode] Set edit mode defaultValues:', state.defaultValues);
  } else {
    // Reset form for add mode
    state.form.title = 'Add Placement';
    state.form.description = 'Create a new placement configuration';
    state.form.actions.buttons[0].content = 'Add Placement';

    // Reset default values
    state.defaultValues = {
      name: '',
      x: '0',
      y: '0',
      scale: '1',
      anchor: 'center-center',
      rotation: '0',
    };

    console.log('[setEditMode] Reset to add mode defaultValues:', state.defaultValues);
  }
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

  // Generate a form key that changes when switching between add/edit mode
  const formKey = state.editMode ? `edit_${state.editItemId}` : 'add';

  const viewData = {
    flatGroups,
    selectedItemId: props.selectedItemId,
    searchQuery: state.searchQuery,
    isDialogOpen: state.isDialogOpen,
    editMode: state.editMode,
    editItemId: state.editItemId,
    defaultValues: state.defaultValues,
    form: state.form,
    formKey,
  };

  // Log when dialog is open to debug form data
  if (state.isDialogOpen) {
    console.log('[toViewData] Dialog open with:', {
      editMode: viewData.editMode,
      editItemId: viewData.editItemId,
      formKey: viewData.formKey,
      defaultValues: viewData.defaultValues,
      formTitle: viewData.form.title,
      formButtonText: viewData.form.actions.buttons[0].content
    });
  }

  return viewData;
};
