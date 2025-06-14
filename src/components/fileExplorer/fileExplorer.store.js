
export const INITIAL_STATE = Object.freeze({
  isDragging: false,
  selectedItemId: undefined,

  // -2 means no target drag index
  targetDragIndex: -2,
  itemRects: {},
  
  // Track collapsed folder IDs
  collapsedIds: [],
});

export const startDragging = (state, { id, itemRects }) => {
  state.isDragging = true;
  state.selectedItemId = id;
  state.itemRects = itemRects;
}

export const stopDragging = (state) => {
  state.isDragging = false;
  state.selectedItemId = undefined;
  state.targetDragIndex = -2;
  state.itemRects = {};
}

export const setTargetDragIndex = (state, index) => {
  state.targetDragIndex = index;
  console.log('setTargetDragIndex, state', state.targetDragIndex)
}

export const selectTargetDragIndex = (state, props, payload) => {
  return state.targetDragIndex;
}

export const selectItemRects = (state, props, payload) => {
  return state.itemRects;
}

export const selectIsDragging = (state, props, payload) => {
  return state.isDragging;
}

export const selectSelectedItemId = (state, props, payload) => {
  return state.selectedItemId;
}

export const toggleFolderExpand = (state, folderId) => {
  const currentIndex = state.collapsedIds.indexOf(folderId);
  console.log(`Toggle folder ${folderId}: currentIndex=${currentIndex}, collapsedIds=`, state.collapsedIds);
  
  if (currentIndex >= 0) {
    // Remove from collapsed list (expand)
    state.collapsedIds.splice(currentIndex, 1);
    console.log(`Expanded folder ${folderId}, new collapsedIds=`, state.collapsedIds);
  } else {
    // Add to collapsed list (collapse)
    state.collapsedIds.push(folderId);
    console.log(`Collapsed folder ${folderId}, new collapsedIds=`, state.collapsedIds);
  }
}

export const toViewData = ({ state, props }, payload) => {
  let items = props.items || [];
  
  // Filter items based on collapsed state
  const visibleItems = items.filter(item => {
    // Always show root level items
    if (item._level === 0) return true;
    
    // Check if any parent is collapsed
    let currentParentId = item.parentId;
    while (currentParentId) {
      if (state.collapsedIds.includes(currentParentId)) {
        return false; // Parent is collapsed, hide this item
      }
      // Find the parent's parent
      const parent = items.find(p => p.id === currentParentId);
      currentParentId = parent?.parentId;
    }
    
    return true;
  });
  
  // Map items with additional UI properties
  const processedItems = visibleItems.map((item) => {
    const isCollapsed = state.collapsedIds.includes(item.id);
    const arrowIcon = item.hasChildren ? (isCollapsed ? 'folderArrowRight' : 'folderArrowDown') : null;
    
    // Debug logging
    if (item.hasChildren) {
      console.log(`Item ${item.name} (${item.id}): collapsed=${isCollapsed}, arrowIcon=${arrowIcon}`);
    }
    
    return {
      ...item,
      ml: item._level * 16,
      arrowIcon,
    }
  });

  return {
    ...state,
    items: processedItems,
  };
}

