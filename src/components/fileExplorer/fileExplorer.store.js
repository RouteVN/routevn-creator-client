
export const INITIAL_STATE = Object.freeze({
  isDragging: false,
  selectedItemId: undefined,

  // -2 means no target drag index
  targetDragIndex: -2,
  targetDragPosition: 0,
  itemRects: {},
  containerTop: 0,
  
  // Track collapsed folder IDs
  collapsedIds: [],
});

export const startDragging = (state, { id, itemRects, containerTop }) => {
  state.isDragging = true;
  state.selectedItemId = id;
  state.itemRects = itemRects;
  state.containerTop = containerTop;
}

export const stopDragging = (state) => {
  state.isDragging = false;
  state.selectedItemId = undefined;
  state.targetDragIndex = -2;
  state.targetDragPosition = 0;
  state.itemRects = {};
  state.containerTop = 0;
}

export const setTargetDragIndex = (state, index) => {
  state.targetDragIndex = index;
}

export const setTargetDragPosition = (state, position) => {
  state.targetDragPosition = position;
}

export const selectTargetDragIndex = ({ state }) => {
  return state.targetDragIndex;
}

export const selectTargetDragPosition = ({ state }) => {
  return state.targetDragPosition;
}

export const selectItemRects = ({ state }) => {
  return state.itemRects;
}

export const selectContainerTop = ({ state }) => {
  return state.containerTop;
}

export const selectIsDragging = ({ state }) => {
  return state.isDragging;
}

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
}

export const toggleFolderExpand = (state, folderId) => {
  const currentIndex = state.collapsedIds.indexOf(folderId);
  
  if (currentIndex >= 0) {
    // Remove from collapsed list (expand)
    state.collapsedIds.splice(currentIndex, 1);
  } else {
    // Add to collapsed list (collapse)
    state.collapsedIds.push(folderId);
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
    
    return {
      ...item,
      ml: item._level * 16,
      arrowIcon,
    }
  });

  const viewData = {
    ...state,
    items: processedItems,
    targetDragIndex: state.targetDragIndex,
    targetDragPosition: state.targetDragPosition,
    isDragging: state.isDragging,
  };
  
  return viewData;
}

