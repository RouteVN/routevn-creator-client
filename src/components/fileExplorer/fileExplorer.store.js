
export const INITIAL_STATE = Object.freeze({
  isDragging: false,
  selectedItemId: undefined,

  // -2 means no target drag index
  targetDragIndex: -2,
  targetDragPosition: 0,
  targetDropPosition: 'above',
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
  state.targetDropPosition = 'above';
  state.itemRects = {};
  state.containerTop = 0;
}

export const setTargetDragIndex = (state, index) => {
  state.targetDragIndex = index;
}

export const setTargetDragPosition = (state, position) => {
  state.targetDragPosition = position;
}

export const setTargetDropPosition = (state, dropPosition) => {
  state.targetDropPosition = dropPosition;
}

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
}

export const selectTargetDragIndex = ({ state }) => {
  return state.targetDragIndex;
}

export const selectTargetDragPosition = ({ state }) => {
  return state.targetDragPosition;
}

export const selectTargetDropPosition = ({ state }) => {
  return state.targetDropPosition;
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

  const targetDragItem = visibleItems[state.targetDragIndex];
  console.log('targetDragItem', {
    'state.targetDragIndex': state.targetDragIndex,
    targetDragItem,
    targetDropPosition: state.targetDropPosition,
  })
  
  // Map items with additional UI properties
  const processedItems = visibleItems.map((item) => {
    const isCollapsed = state.collapsedIds.includes(item.id);
    const arrowIcon = item.hasChildren ? (isCollapsed ? 'folderArrowRight' : 'folderArrowDown') : null;

    let bc = "bg"
    let hBgc = "mu"
    let bgc = ""
    if (state.targetDropPosition === 'inside' && item.id === targetDragItem?.id) {
      bc = "o";
    }

    if (state.isDragging) {
      hBgc = "";
    }

    if (item.id === state.selectedItemId) {
      bgc = "mu";
    }
    
    return {
      ...item,
      ml: item._level * 16,
      arrowIcon,
      bc,
      hBgc,
      bgc,
    }
  });

  // Calculate left offset for drag indicator bar
  let targetDragLeftOffset = 0;
  if (targetDragItem && state.targetDropPosition !== 'inside') {
    // When dropping above an item, use that item's level
    // When dropping below an item, use that item's level
    targetDragLeftOffset = targetDragItem._level * 24;
  }

  const viewData = {
    ...state,
    items: processedItems,
    targetDragIndex: state.targetDragIndex,
    targetDragPosition: state.targetDragPosition,
    targetDropPosition: state.targetDropPosition,
    targetDragLeftOffset,
    isDragging: state.isDragging,
  };
  
  return viewData;
}

