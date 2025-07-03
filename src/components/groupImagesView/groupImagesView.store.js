export const INITIAL_STATE = Object.freeze({
  collapsedIds: [],
  searchQuery: '',
  zoomLevel: 1.0,
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

export const setZoomLevel = (state, zoomLevel) => {
  state.zoomLevel = Math.max(0.5, Math.min(4.0, zoomLevel));
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

  const baseWidth = 200;
  const baseHeight = 150;
  const imageWidth = Math.round(baseWidth * state.zoomLevel);
  const imageHeight = Math.round(baseHeight * state.zoomLevel);

  return {
    flatGroups,
    selectedItemId: props.selectedItemId,
    uploadText: "Upload Image",
    acceptedFileTypes: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
    searchQuery: state.searchQuery,
    zoomLevel: state.zoomLevel,
    imageWidth,
    imageHeight
  };
};