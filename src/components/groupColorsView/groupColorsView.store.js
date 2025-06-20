export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  searchQuery: '',
  isDialogOpen: false,
  targetGroupId: null,
  editMode: false,
  editItemId: null,
  
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
      inputType: 'colorPicker',
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

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
}

export const toggleDialog = (state) => {
  state.isDialogOpen = !state.isDialogOpen;
}

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
}

export const setEditMode = (state, editMode, itemId = null, itemData = null) => {
  state.editMode = editMode;
  state.editItemId = itemId;
  
  if (editMode && itemData) {
    // Update form for edit mode
    state.form.title = 'Edit Color';
    state.form.description = 'Edit the color';
    state.form.actions.buttons[0].content = 'Update Color';
    
    // Update default values with current item data
    state.defaultValues = {
      name: itemData.name || '',
      hex: itemData.hex || '#ff0000',
    };
  } else {
    // Reset form for add mode
    state.form.title = 'Add Color';
    state.form.description = 'Create a new color';
    state.form.actions.buttons[0].content = 'Add Color';
    
    // Reset default values
    state.defaultValues = {
      name: '',
      hex: '#ff0000',
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
    const hex = (item.hex || '').toLowerCase();
    
    return name.includes(searchQuery) || hex.includes(searchQuery);
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
    uploadText: "Upload Color Files",
    isDialogOpen: state.isDialogOpen,
    editMode: state.editMode,
    editItemId: state.editItemId,
    defaultValues: state.defaultValues,
    form: state.form,
    searchQuery: state.searchQuery
  };
};