import { fromEvent, tap } from "rxjs";
import { nanoid } from "nanoid";

/**
 *  we need to find the item that is under the mouse
 *  if mouse is above 1st item, return -1
 *  otherwise return the index of the item that is under the mouse
 *  if mouse is below the last item, return the index of the last item + 1
 *  for the gap betwen items, return to the one closest. if same distance, fallback to the top one
 * @param {number} _mouseY 
 * @param {object} itemRects 
 * @param {number} offset 
 * @param {array} items 
 * @returns {object}
 */
export const getSelectedItemIndex = (_mouseY, itemRects, offset, items = []) => {
  if (!itemRects) {
    return { index: -1, position: 0, dropPosition: 'above' };
  }

  const mouseY = _mouseY + offset;

  const sortedItems = Object.entries(itemRects)
    .filter(([id]) => id !== "container")
    .sort((a, b) => a[1].top - b[1].top)
    .map(([id, rect]) => ({ id, ...rect }));

  if (sortedItems.length === 0) {
    return { index: -1, position: 0, dropPosition: 'above' };
  }

  if (mouseY < sortedItems[0].top) {
    return { index: -1, position: sortedItems[0].top, dropPosition: 'above' };
  }

  const lastItem = sortedItems[sortedItems.length - 1];
  if (mouseY > lastItem.bottom) {
    return { index: sortedItems.length - 1, position: lastItem.bottom, dropPosition: 'below' };
  }

  for (let i = 0; i < sortedItems.length; i++) {
    const currentItem = sortedItems[i];

    if (mouseY >= currentItem.top && mouseY <= currentItem.bottom) {
      // Get the actual item data to check its type
      const itemId = currentItem.id.replace('item-', '');
      const actualItem = items.find(item => item.id === itemId);
      const isFolder = actualItem?.type === 'folder';
      
      // Mouse is over an item - determine position with 35% top, 30% middle, 35% bottom
      const relativeY = mouseY - currentItem.top;
      const topThreshold = currentItem.height * 0.35;
      const bottomThreshold = currentItem.height * 0.65;
      
      if (relativeY < topThreshold) {
        // Top 35% - drop above
        return { index: i - 1, position: currentItem.top, dropPosition: 'above' };
      } else if (relativeY < bottomThreshold && isFolder) {
        // Middle 30% - drop inside (only if target is a folder)
        return { index: i, position: currentItem.top + (currentItem.height / 2), dropPosition: 'inside' };
      } else {
        // Bottom 35% (or middle 30% if not a folder) - drop below
        return { index: i, position: currentItem.bottom, dropPosition: 'below' };
      }
    }

    if (i < sortedItems.length - 1) {
      const nextItem = sortedItems[i + 1];
      if (mouseY > currentItem.bottom && mouseY < nextItem.top) {
        const distanceToCurrentBottom = mouseY - currentItem.bottom;
        const distanceToNextTop = nextItem.top - mouseY;

        if (distanceToCurrentBottom <= distanceToNextTop) {
          return { index: i, position: currentItem.bottom, dropPosition: 'below' };
        } else {
          return { index: i, position: nextItem.top, dropPosition: 'above' };
        }
      }
    }
  }

  return { index: sortedItems.length - 1, position: sortedItems[sortedItems.length - 1].bottom, dropPosition: 'below' };
};

export const handleItemMouseDown = (e, deps) => {
  const { store, getRefIds, render } = deps;
  const refIds = getRefIds();

  // Get the container element to calculate relative positions
  const containerRect = e.currentTarget.parentElement.getBoundingClientRect();
  
  const itemRects = Object.keys(refIds).reduce((acc, key) => {
    const ref = refIds[key];
    if (!key.startsWith('item-')) {
      return acc;
    }
    const rect = ref.elm.getBoundingClientRect();
    acc[key] = {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      y: rect.top,
      relativeTop: rect.top - containerRect.top,
      relativeBottom: rect.bottom - containerRect.top,
    };
    return acc;
  }, {});
  
  const itemId = e.currentTarget.id.replace('item-', '');
  store.startDragging({ id: itemId, itemRects, containerTop: containerRect.top });
  render();
};

export const handleWindowMouseUp = (e, deps) => {
  const { store, dispatchEvent, render, props } = deps;

  if (!store.selectIsDragging()) {
    return;
  }
  const targetIndex = store.selectTargetDragIndex();
  const dropPosition = store.selectTargetDropPosition();
  const sourceId = store.selectSelectedItemId();
  const targetItem = props.items[targetIndex];
  const sourceItem = props.items.find(item => item.id === sourceId);
  
  store.stopDragging();
  render();
  
  // Don't trigger event if source and target are the same item
  if (sourceItem && targetItem && sourceItem.id === targetItem.id) {
    return;
  }
  
  const detail = {
    target: targetItem,
    source: sourceItem,
    position: dropPosition,
  };
  
  // Handle the drag/drop internally instead of emitting target-changed
  handleTargetChanged({ detail }, deps);
};

export const handleWindowMouseMove = (e, deps) => {
  const isDragging = deps.store.selectIsDragging();
  
  if (!isDragging) {
    return;
  }
  const { store, render, props } = deps;
  const itemRects = store.selectItemRects();
  const containerTop = store.selectContainerTop();
  const items = props.items || [];
  const sourceId = store.selectSelectedItemId();

  const result = getSelectedItemIndex(e.clientY, itemRects, 0, items);
  
  // Find the source item's index in the items array
  const sourceIndex = items.findIndex(item => item.id === sourceId);
  
  // Check if the drop position would result in no movement
  let isNoOpDrop = false;
  
  if (result.dropPosition === 'inside') {
    // Dropping inside the source itself
    isNoOpDrop = items[result.index]?.id === sourceId;
  } else if (result.dropPosition === 'above') {
    // Dropping above the source (which means index would be sourceIndex - 1)
    isNoOpDrop = result.index === sourceIndex - 1;
  } else if (result.dropPosition === 'below') {
    // Dropping below the source (which means index would be sourceIndex)
    isNoOpDrop = result.index === sourceIndex;
  }
  
  // If dragging would result in no movement, hide the drag indicators
  if (isNoOpDrop) {
    store.setTargetDragIndex(-2); // -2 means no drag indicator
    store.setTargetDragPosition(0);
    store.setTargetDropPosition('none');
    render();
    return;
  }
  
  // Convert absolute position to relative position
  const relativePosition = result.position - containerTop;

  if (store.selectTargetDragIndex() === result.index && 
      store.selectTargetDragPosition() === relativePosition &&
      store.selectTargetDropPosition() === result.dropPosition) {
    return;
  }

  store.setTargetDragIndex(result.index);
  store.setTargetDragPosition(relativePosition);
  store.setTargetDropPosition(result.dropPosition);
  render();
};

export const subscriptions = (deps) => {
  return [
    fromEvent(window, "mousemove", { passive: true }).pipe(
      tap((e) => {
        deps.handlers.handleWindowMouseMove(e, deps);
      })
    ),
    fromEvent(window, "mouseup", { passive: true }).pipe(
      tap((e) => {
        deps.handlers.handleWindowMouseUp(e, deps);
      })
    ),
  ];
};

export const handleContainerContextMenu = (e, deps) => {
  const { store, render, props } = deps;
  e.preventDefault();
  
  // Show dropdown menu for empty space
  store.showDropdownMenuFileExplorerEmpty({
    position: { x: e.clientX, y: e.clientY },
    emptyContextMenuItems: props.emptyContextMenuItems
  });
  render();
};

export const handleItemContextMenu = (e, deps) => {
  const { store, render, props } = deps;
  e.preventDefault();
  
  const itemId = e.currentTarget.id.replace('item-', '');
  
  // Show dropdown menu for item
  store.showDropdownMenuFileExplorerItem({
    position: { x: e.clientX, y: e.clientY },
    id: itemId,
    contextMenuItems: props.contextMenuItems
  });
  render();
};

export const handleItemClick = (e, deps) => {
  const { dispatchEvent, store, render } = deps;
  const itemId = e.currentTarget.id.replace('item-', '');
  
  // Update selected item
  store.setSelectedItemId(itemId);
  render();
  
  dispatchEvent(new CustomEvent("click-item", {
    detail: {
      id: itemId,
    },
  }));
};

export const handleArrowClick = (e, deps) => {
  const { store, render } = deps;
  e.stopPropagation(); // Prevent triggering item click
  const folderId = e.currentTarget.id.replace('arrow-', '');
  store.toggleFolderExpand(folderId);
  render();
};

export const handleDropdownMenuClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, dispatchEvent, render } = deps;
  const detail = e.detail;
  const itemId = store.selectDropdownMenuItemId();
  
  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;
  
  console.log("handleDropdownMenuClickItem:", { detail, item, itemId });
  
  // Store position before hiding dropdown (for rename popover)
  const position = store.selectDropdownMenuPosition();
  console.log("Stored position:", position);
  
  // Hide dropdown
  store.hideDropdownMenu();
  render();
  
  // Handle rename action internally (show popover)
  if (item.value === 'rename-item' && itemId) {
    console.log("Showing popover for rename at position:", position);
    store.showPopover({ position, itemId });
    render();
    return; // Don't emit event for rename, handle it internally
  }
  
  // Handle file action internally
  handleFileAction({ detail: { ...detail, itemId } }, deps);
};

export const handlePopoverClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, dispatchEvent, render } = deps;
  const detail = e.detail;
  
  console.log("handleFormActionClick:", detail);
  
  // Extract action and values from detail (form structure may vary)
  const action = detail.action || detail.actionId;
  const values = detail.values || detail.formValues || detail;
  
  console.log("Extracted:", { action, values });
  
  if (action === 'cancel') {
    console.log("Canceling rename");
    store.hidePopover();
    render();
    return;
  }
  
  if (action === 'submit') {
    console.log("Submitting rename");
    // Get the popover item ID from state
    const storeState = store.getState ? store.getState() : store.state;
    const itemId = storeState ? storeState.popover.itemId : null;
    
    // Hide popover
    store.hidePopover();
    render();
    
    // Handle rename file action internally
    handleFileAction({ 
      detail: {
        value: 'rename-item-confirmed',
        itemId,
        newName: values.name
      }
    }, deps);
  }
};

export const handleFileAction = (e, deps) => {
  const { dispatchEvent, repository, props } = deps;
  const detail = e.detail;
  const repositoryTarget = props.repositoryTarget;
  
  if (!repositoryTarget) {
    throw new Error("🔧 REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component");
  }
  
  console.log("🔧 handleFileAction called with:", {
    detail,
    repositoryTarget,
    propsRepositoryTarget: props.repositoryTarget,
    allProps: props
  });
  
  // Extract the actual item from the detail (rtgl-dropdown-menu adds index)
  const item = detail.item || detail;
  const itemId = detail.itemId;

  console.log("🔧 Extracted values:", { item, itemId });

  if (item.value === "new-item") {
    console.log("🔧 Processing new-item action for target:", repositoryTarget);
    
    const repositoryStateBefore = repository.getState();
    console.log("🔧 Repository state BEFORE action:", {
      target: repositoryTarget,
      targetData: repositoryStateBefore[repositoryTarget]
    });
    
    repository.addAction({
      actionType: "treePush",
      target: repositoryTarget,
      value: {
        parent: "_root",
        position: "last",
        item: {
          id: nanoid(),
          type: "folder",
          name: "New Folder",
        },
      },
    });
    
    const repositoryStateAfter = repository.getState();
    console.log("🔧 Repository state AFTER action:", {
      target: repositoryTarget,
      targetData: repositoryStateAfter[repositoryTarget]
    });
  } else if (item.value === "rename-item-confirmed") {
    // Handle rename confirmation from popover form
    if (itemId && detail.newName) {
      repository.addAction({
        actionType: "treeUpdate",
        target: repositoryTarget,
        value: {
          id: itemId,
          replace: false,
          item: {
            name: detail.newName,
          },
        },
      });
    }
  } else if (item.value === "delete-item") {
    const repositoryState = repository.getState();
    const targetData = repositoryState[repositoryTarget];
    const currentItem = targetData && targetData.items ? targetData.items[itemId] : null;

    if (currentItem) {
      repository.addAction({
        actionType: "treeDelete",
        target: repositoryTarget,
        value: {
          id: itemId,
        },
      });
    }
  } else if (item.value === "new-child-folder") {
    const repositoryState = repository.getState();
    const targetData = repositoryState[repositoryTarget];
    const currentItem = targetData && targetData.items ? targetData.items[itemId] : null;

    if (currentItem) {
      repository.addAction({
        actionType: "treePush",
        target: repositoryTarget,
        value: {
          parent: itemId,
          position: "last",
          item: {
            id: nanoid(),
            type: "folder",
            name: "New Folder",
          },
        },
      });
    }
  }

  // Emit data-changed event after any repository action
  console.log("🔧 Emitting data-changed event:", { target: repositoryTarget });
  dispatchEvent(new CustomEvent("data-changed", {
    detail: { target: repositoryTarget },
    bubbles: true,
    composed: true
  }));
  console.log("🔧 data-changed event emitted successfully");
};

export const handleTargetChanged = (e, deps) => {
  const { dispatchEvent, repository, props } = deps;
  const repositoryTarget = props.repositoryTarget;
  
  if (!repositoryTarget) {
    throw new Error("🔧 REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component");
  }

  console.log("handleTargetChanged", e.detail);
  
  const { target, source, position } = e.detail;
  
  if (!source || !source.id) {
    console.warn("No source item provided");
    return;
  }

  let repositoryPosition;
  let parent;

  if (position === 'inside') {
    // Drop inside a folder
    if (!target || target.type !== 'folder') {
      console.warn("Cannot drop inside non-folder item");
      return;
    }
    parent = target.id;
    repositoryPosition = 'last'; // Add to end of folder
  } else if (position === 'above') {
    // Drop above target item
    if (!target || !target.id) {
      console.warn("No target item for above position");
      return;
    }
    parent = target.parentId || "_root";
    repositoryPosition = { before: target.id };
  } else if (position === 'below') {
    // Drop below target item  
    if (!target || !target.id) {
      console.warn("No target item for below position");
      return;
    }
    parent = target.parentId || "_root";
    repositoryPosition = { after: target.id };
  } else {
    console.warn("Unknown drop position:", position);
    return;
  }

  repository.addAction({
    actionType: "treeMove",
    target: repositoryTarget,
    value: {
      id: source.id,
      parent: parent,
      position: repositoryPosition,
    },
  });

  // Emit data-changed event after repository action
  dispatchEvent(new CustomEvent("data-changed", {
    detail: { target: repositoryTarget },
    bubbles: true,
    composed: true
  }));
};
