import { fromEvent, tap } from "rxjs";

const calculateForbiddenTargets = (sourceItem, allItems) => {
  if (!sourceItem) return [];

  const forbiddenIds = new Set();
  forbiddenIds.add(sourceItem.id);

  const findDescendants = (parentId) => {
    const children = allItems.filter((item) => item.parentId === parentId);
    children.forEach((child) => {
      forbiddenIds.add(child.id);
      findDescendants(child.id);
    });
  };

  findDescendants(sourceItem.id);

  return Array.from(forbiddenIds);
};

const getVisibleItems = (allItems, collapsedIds) => {
  return allItems.filter((item) => {
    if (item._level === 0) return true;

    let currentParentId = item.parentId;
    while (currentParentId) {
      if (collapsedIds.includes(currentParentId)) {
        return false;
      }
      const parent = allItems.find((p) => p.id === currentParentId);
      currentParentId = parent?.parentId;
    }

    return true;
  });
};

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
export const getSelectedItemIndex = (
  _mouseY,
  itemRects,
  offset,
  items = [],
) => {
  if (!itemRects) {
    return { index: -1, position: 0, dropPosition: "above" };
  }

  const mouseY = _mouseY + offset;

  const sortedItems = Object.entries(itemRects)
    .filter(([id]) => id !== "container")
    .sort((a, b) => a[1].top - b[1].top)
    .map(([id, rect]) => ({ id, ...rect }));

  if (sortedItems.length === 0) {
    return { index: -1, position: 0, dropPosition: "above" };
  }

  if (mouseY < sortedItems[0].top) {
    return { index: -1, position: sortedItems[0].top, dropPosition: "above" };
  }

  const lastItem = sortedItems[sortedItems.length - 1];
  if (mouseY > lastItem.bottom) {
    return {
      index: sortedItems.length - 1,
      position: lastItem.bottom,
      dropPosition: "below",
    };
  }

  for (let i = 0; i < sortedItems.length; i++) {
    const currentItem = sortedItems[i];

    if (mouseY >= currentItem.top && mouseY <= currentItem.bottom) {
      // Get the actual item data to check its type
      const itemId = currentItem.id.replace("item-", "");
      const actualItem = items.find((item) => item.id === itemId);
      const isFolder = actualItem?.type === "folder";

      // Mouse is over an item - determine position with 35% top, 30% middle, 35% bottom
      const relativeY = mouseY - currentItem.top;
      const topThreshold = currentItem.height * 0.35;
      const bottomThreshold = currentItem.height * 0.65;

      if (relativeY < topThreshold) {
        // Top 35% - drop above
        return {
          index: i - 1,
          position: currentItem.top,
          dropPosition: "above",
        };
      } else if (relativeY < bottomThreshold && isFolder) {
        // Middle 30% - drop inside (only if target is a folder)
        return {
          index: i,
          position: currentItem.top + currentItem.height / 2,
          dropPosition: "inside",
        };
      } else {
        // Bottom 35% (or middle 30% if not a folder) - drop below
        return {
          index: i,
          position: currentItem.bottom,
          dropPosition: "below",
        };
      }
    }

    if (i < sortedItems.length - 1) {
      const nextItem = sortedItems[i + 1];
      if (mouseY > currentItem.bottom && mouseY < nextItem.top) {
        const distanceToCurrentBottom = mouseY - currentItem.bottom;
        const distanceToNextTop = nextItem.top - mouseY;

        if (distanceToCurrentBottom <= distanceToNextTop) {
          return {
            index: i,
            position: currentItem.bottom,
            dropPosition: "below",
          };
        } else {
          return { index: i, position: nextItem.top, dropPosition: "above" };
        }
      }
    }
  }

  return {
    index: sortedItems.length - 1,
    position: sortedItems[sortedItems.length - 1].bottom,
    dropPosition: "below",
  };
};

export const handleItemMouseDown = (deps, payload) => {
  const { store, getRefIds, render, props } = deps;
  const refIds = getRefIds();

  // Get the container element to calculate relative positions
  const containerRect =
    payload._event.currentTarget.parentElement.getBoundingClientRect();

  const itemRects = Object.keys(refIds).reduce((acc, key) => {
    const ref = refIds[key];
    if (!key.startsWith("item-")) {
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

  const itemId = payload._event.currentTarget.id.replace("item-", "");
  const sourceItem = props.items.find((item) => item.id === itemId);
  const forbiddenTargetIds = calculateForbiddenTargets(sourceItem, props.items);
  const visibleItems = getVisibleItems(props.items, store.selectCollapsedIds());
  const forbiddenIndices = forbiddenTargetIds
    .map((id) => visibleItems.findIndex((item) => item.id === id))
    .filter((index) => index !== -1);

  store.startDragging({
    id: itemId,
    itemRects,
    containerTop: containerRect.top,
    forbiddenIndices,
  });
  render();
};

export const handleWindowMouseUp = (deps) => {
  const { store, dispatchEvent, render, props } = deps;

  if (!store.selectIsDragging()) {
    return;
  }
  const targetIndex = store.selectTargetDragIndex();
  const dropPosition = store.selectTargetDropPosition();
  const sourceId = store.selectSelectedItemId();
  const targetItem = props.items[targetIndex];
  const sourceItem = props.items.find((item) => item.id === sourceId);
  const forbiddenIndices = store.selectForbiddenIndices();

  if (forbiddenIndices.includes(targetIndex)) {
    store.stopDragging();
    render();
    return;
  }

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

  // Emit target-changed event
  dispatchEvent(
    new CustomEvent("target-changed", {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleWindowMouseMove = (deps, payload) => {
  const isDragging = deps.store.selectIsDragging();

  if (!isDragging) {
    return;
  }
  const { store, render, props } = deps;
  const itemRects = store.selectItemRects();
  const containerTop = store.selectContainerTop();
  const items = props.items || [];
  const sourceId = store.selectSelectedItemId();
  const forbiddenIndices = store.selectForbiddenIndices();

  const result = getSelectedItemIndex(
    payload._event.clientY,
    itemRects,
    0,
    items,
  );

  // Find the source item's index in the items array
  const isForbiddenDrop = forbiddenIndices.includes(result.index);

  if (isForbiddenDrop) {
    store.setTargetDragIndex(-2);
    store.setTargetDragPosition(0);
    store.setTargetDropPosition("none");
    render();
    return;
  }

  const sourceIndex = items.findIndex((item) => item.id === sourceId);

  // Check if the drop position would result in no movement
  let isNoOpDrop = false;

  if (result.dropPosition === "inside") {
    // Dropping inside the source itself
    isNoOpDrop = items[result.index]?.id === sourceId;
  } else if (result.dropPosition === "above") {
    // Dropping above the source (which means index would be sourceIndex - 1)
    isNoOpDrop = result.index === sourceIndex - 1;
  } else if (result.dropPosition === "below") {
    // Dropping below the source (which means index would be sourceIndex)
    isNoOpDrop = result.index === sourceIndex;
  }

  // If dragging would result in no movement, hide the drag indicators
  if (isNoOpDrop) {
    store.setTargetDragIndex(-2); // -2 means no drag indicator
    store.setTargetDragPosition(0);
    store.setTargetDropPosition("none");
    render();
    return;
  }

  // Convert absolute position to relative position
  const relativePosition = result.position - containerTop;

  if (
    store.selectTargetDragIndex() === result.index &&
    store.selectTargetDragPosition() === relativePosition &&
    store.selectTargetDropPosition() === result.dropPosition
  ) {
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
        deps.handlers.handleWindowMouseMove(deps, { _event: e });
      }),
    ),
    fromEvent(window, "mouseup", { passive: true }).pipe(
      tap((e) => {
        deps.handlers.handleWindowMouseUp(deps, { _event: e });
      }),
    ),
  ];
};

export const handleContainerContextMenu = (deps, payload) => {
  const { store, render, props } = deps;
  payload._event.preventDefault();

  // Show dropdown menu for empty space
  store.showDropdownMenuFileExplorerEmpty({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    emptyContextMenuItems: props.emptyContextMenuItems,
  });
  render();
};

export const handleEmptyMessageClick = (deps, payload) => {
  const { store, render, props } = deps;
  payload._event.preventDefault();

  // Show dropdown menu when clicking on empty message
  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.showDropdownMenuFileExplorerEmpty({
    position: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    emptyContextMenuItems: props.emptyContextMenuItems,
  });
  render();
};

export const handleItemContextMenu = (deps, payload) => {
  const { store, render, props } = deps;
  payload._event.preventDefault();

  const itemId = payload._event.currentTarget.id.replace("item-", "");

  // Find the item to get its type
  const item = props.items?.find((item) => item.id === itemId);

  // Filter context menu items based on item type
  let filteredMenuItems = props.contextMenuItems;
  if (item && (item.type === "sprite" || item.type === "text")) {
    // For sprite and text items, only show Rename and Delete options
    filteredMenuItems = props.contextMenuItems?.filter(
      (menuItem) =>
        menuItem.value === "rename-item" || menuItem.value === "delete-item",
    );
  }

  // Show dropdown menu for item
  store.showDropdownMenuFileExplorerItem({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    id: itemId,
    type: item?.type,
    contextMenuItems: filteredMenuItems,
  });
  render();
};

export const handleItemClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  const itemId = payload._event.currentTarget.id.replace("item-", "");

  // Update selected item
  store.setSelectedItemId(itemId);
  render();

  dispatchEvent(
    new CustomEvent("click-item", {
      detail: {
        id: itemId,
      },
    }),
  );
};

export const handleItemDblClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = payload._event.currentTarget.id.replace("item-", "");

  dispatchEvent(
    new CustomEvent("dblclick-item", {
      detail: {
        itemId,
      },
    }),
  );
};

export const handlePageItemClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event

  store.setSelectedItemId(itemId);
  render();
};

export const handleArrowClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation(); // Prevent triggering item click
  const folderId = payload._event.currentTarget.id.replace("arrow-", "");
  store.toggleFolderExpand(folderId);
  render();
};

export const handleDropdownMenuClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, dispatchEvent, render } = deps;
  const detail = payload._event.detail;
  const itemId = store.selectDropdownMenuItemId();

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  // Store position before hiding dropdown (for rename popover)
  const position = store.selectDropdownMenuPosition();

  // Hide dropdown
  store.hideDropdownMenu();
  render();

  // Handle rename action internally (show popover)
  if (item.value === "rename-item" && itemId) {
    store.showPopover({ position, itemId });
    render();
    return; // Don't emit event for rename, handle it internally
  }

  // Emit file-action event for other actions
  dispatchEvent(
    new CustomEvent("file-action", {
      detail: { ...detail, itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePopoverClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleFormActionClick = (deps, payload) => {
  const { store, dispatchEvent, render } = deps;
  const detail = payload._event.detail;

  // Extract action and values from detail (form structure may vary)
  const action = detail.action || detail.actionId;
  const values = detail.values || detail.formValues || detail;

  if (action === "cancel") {
    store.hidePopover();
    render();
    return;
  }

  if (action === "submit") {
    // Get the popover item ID from state
    const storeState = store.getState ? store.getState() : store.state;
    const itemId = storeState ? storeState.popover.itemId : null;

    // Hide popover
    store.hidePopover();
    render();

    // Emit file-action event for rename confirmation
    dispatchEvent(
      new CustomEvent("file-action", {
        detail: {
          value: "rename-item-confirmed",
          itemId,
          newName: values.name,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
};
