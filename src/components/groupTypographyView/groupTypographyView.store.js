export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  searchQuery: '',
  isDialogOpen: false,
  targetGroupId: null,
  
  defaultValues: {
    name: '',
    fontSize: '16',
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
      id: 'fontColor',
      fieldName: 'fontColor',
      inputType: 'inputText',
      label: 'Color',
      description: 'Enter the font color name',
      required: true,
    }, {
      id: 'fontStyle',
      fieldName: 'fontStyle',
      inputType: 'inputText',
      label: 'Font Style',
      description: 'Enter the font style name',
      required: true,
    }, {
      id: 'fontSize',
      fieldName: 'fontSize',
      inputType: 'inputText',
      label: 'Font Size',
      description: 'Enter the font size (e.g., 16, 18, 24)',
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

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
}

export const toggleDialog = (state) => {
  state.isDialogOpen = !state.isDialogOpen;
}

export const setTargetGroupId = (state, groupId) => {
  state.targetGroupId = groupId;
}

export const toViewData = ({ state, props }, payload) => {
  const selectedItemId = props.selectedItemId;
  const searchQuery = state.searchQuery.toLowerCase();
  
  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) return true;
    
    const name = (item.name || '').toLowerCase();
    const fontSize = (item.fontSize || '').toString().toLowerCase();
    const fontColor = (item.fontColor || '').toLowerCase();
    const fontWeight = (item.fontWeight || '').toLowerCase();
    
    return name.includes(searchQuery) || 
           fontSize.includes(searchQuery) || 
           fontColor.includes(searchQuery) || 
           fontWeight.includes(searchQuery);
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
    uploadText: "Upload Typography Files",
    isDialogOpen: state.isDialogOpen,
    searchQuery: state.searchQuery,
    defaultValues: state.defaultValues,
    form: state.form
  };
};