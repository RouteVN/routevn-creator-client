import { fromEvent, tap } from "rxjs";
import { canItemReceiveChildren } from "../../internal/fileExplorerDragOptions.js";

const isBooleanAttrEnabled = (attrs, camelName, kebabName) => {
  const compactName = kebabName.replaceAll("-", "");
  const value =
    attrs?.[camelName] ?? attrs?.[kebabName] ?? attrs?.[compactName];
  if (value === undefined || value === null || value === false) {
    return false;
  }
  if (typeof value === "string") {
    return value !== "false";
  }
  return true;
};

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const initializeCollapsedFolders = (deps) => {
  const { store, props, props: attrs } = deps;
  const shouldStartCollapsed = isBooleanAttrEnabled(
    attrs,
    "startCollapsed",
    "start-collapsed",
  );

  if (!shouldStartCollapsed) {
    return;
  }

  const collapsedIds = (props.items ?? [])
    .filter((item) => item?.hasChildren)
    .map((item) => item.id);

  store.setCollapsedIds({ collapsedIds });
};

export const handleBeforeMount = (deps) => {
  initializeCollapsedFolders(deps);
  return mountSubscriptions(deps);
};

const getItemIdFromEvent = (event) => {
  return event?.currentTarget?.getAttribute?.("data-item-id") || "";
};

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

const emitItemClick = ({ dispatchEvent, item } = {}) => {
  if (!item) {
    return;
  }

  const isFolder = item?.type === "folder";

  dispatchEvent(
    new CustomEvent("item-click", {
      detail: {
        id: item.id,
        itemId: item.id,
        item,
        isFolder,
      },
    }),
  );
};

const emitFolderCollapseChange = ({
  dispatchEvent,
  folderId,
  collapsed,
} = {}) => {
  if (!folderId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("folder-collapse-change", {
      detail: {
        folderId,
        collapsed: collapsed === true,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const getItemElement = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return undefined;
  }

  for (const [refId, element] of Object.entries(deps.refs ?? {})) {
    if (!refId.startsWith("itemRef")) {
      continue;
    }

    if (element?.getAttribute?.("data-item-id") === itemId) {
      return element;
    }
  }

  return undefined;
};

const scrollItemIntoView = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  requestAnimationFrame(() => {
    const itemElement = getItemElement({ deps, itemId });
    itemElement?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  });
};

const selectVisibleItem = ({ deps, item, emitSelectionEvent = false } = {}) => {
  const { dispatchEvent, store, render } = deps;
  if (!item?.id) {
    return undefined;
  }

  store.expandItemAncestors({ itemId: item.id });
  store.setSelectedItemId({ itemId: item.id });
  render();
  scrollItemIntoView({ deps, itemId: item.id });
  if (emitSelectionEvent) {
    emitItemClick({ dispatchEvent, item });
  }
  return item;
};

const toExplorerSelection = ({ item, store } = {}) => {
  if (!item) {
    return undefined;
  }

  return {
    itemId: item.id,
    item,
    isFolder: item.type === "folder",
    isCollapsed:
      item.type === "folder" && store.selectCollapsedIds().includes(item.id),
  };
};

const resolveDropTargetItem = ({ visibleItems, targetIndex, dropPosition }) => {
  if (dropPosition === "above" && targetIndex === -1) {
    return visibleItems[0];
  }

  if (targetIndex < 0) {
    return undefined;
  }

  return visibleItems[targetIndex];
};

const canMoveItemToRoot = (item) => {
  if (!item) {
    return false;
  }

  if (item.type === "folder") {
    return true;
  }

  return item.dragOptions?.canMoveToRoot !== false;
};

const resolveDropPlacement = ({ visibleItems, targetIndex, dropPosition }) => {
  const targetItem = resolveDropTargetItem({
    visibleItems,
    targetIndex,
    dropPosition,
  });

  if (dropPosition === "above" && targetIndex === -1) {
    return {
      targetItem,
      parentId: null,
    };
  }

  if (!targetItem) {
    return {
      targetItem: undefined,
      parentId: undefined,
    };
  }

  if (dropPosition === "inside") {
    return {
      targetItem,
      parentId: canItemReceiveChildren(targetItem) ? targetItem.id : undefined,
    };
  }

  if (dropPosition === "above" || dropPosition === "below") {
    return {
      targetItem,
      parentId: targetItem.parentId ?? null,
    };
  }

  return {
    targetItem,
    parentId: undefined,
  };
};

const isDropPlacementAllowed = ({
  sourceItem,
  visibleItems,
  targetIndex,
  dropPosition,
  forbiddenIndices = [],
} = {}) => {
  if (!sourceItem) {
    return false;
  }

  if (forbiddenIndices.includes(targetIndex)) {
    return false;
  }

  if (targetIndex === -2 || dropPosition === "none") {
    return false;
  }

  const placement = resolveDropPlacement({
    visibleItems,
    targetIndex,
    dropPosition,
  });

  if (placement.parentId === undefined) {
    return false;
  }

  if (placement.parentId === null && !canMoveItemToRoot(sourceItem)) {
    return false;
  }

  return true;
};

const DRAG_ACTIVATION_DISTANCE = 4;

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
    // Check if the last item belongs to an expanded folder
    const lastItemId = lastItem.id;
    const lastActualItem = items.find((item) => item.id === lastItemId);

    if (lastActualItem?.parentId) {
      // Find the parent folder
      const parentFolder = items.find(
        (item) => item.id === lastActualItem.parentId,
      );

      if (canItemReceiveChildren(parentFolder)) {
        // Return the parent folder's below position
        const parentIndex = sortedItems.findIndex(
          (item) => item.id === parentFolder.id,
        );
        return {
          index: parentIndex,
          position: lastItem.bottom,
          dropPosition: "below",
        };
      }
    }

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
      const itemId = currentItem.id;
      const actualItem = items.find((item) => item.id === itemId);
      const isFolder = canItemReceiveChildren(actualItem);

      // Mouse is over an item - determine position with 35% top, 30% middle, 35% bottom
      const relativeY = mouseY - currentItem.top;
      const topThreshold = currentItem.height * 0.35;
      const bottomThreshold = currentItem.height * 0.65;

      if (relativeY < topThreshold) {
        // Top 35% - drop above
        return {
          index: i,
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
  const { store, refs, props, props: attrs } = deps;

  // Drag should start only on primary button.
  if (payload?._event?.button !== 0) {
    return;
  }

  const isDragEnabled =
    isBooleanAttrEnabled(attrs, "allowDrag", "allow-drag") ||
    isBooleanAttrEnabled(attrs, "draggable", "draggable");

  if (!isDragEnabled) {
    return;
  }

  const refIds = refs;

  // Get the container element to calculate relative positions
  const containerRect =
    payload._event.currentTarget.parentElement.getBoundingClientRect();

  const itemRects = Object.keys(refIds).reduce((acc, key) => {
    const ref = refIds[key];
    if (!key.startsWith("itemRef")) {
      return acc;
    }
    const itemId = ref?.getAttribute?.("data-item-id");
    if (!itemId) {
      return acc;
    }
    const rect = ref.getBoundingClientRect();
    acc[itemId] = {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      y: rect.top,
      relativeTop: rect.top - containerRect.top,
      relativeBottom: rect.bottom - containerRect.top,
    };
    return acc;
  }, {});

  const itemId = getItemIdFromEvent(payload._event);
  if (!itemId) {
    return;
  }
  const sourceItem = props.items.find((item) => item.id === itemId);
  const forbiddenTargetIds = calculateForbiddenTargets(sourceItem, props.items);
  const visibleItems = getVisibleItems(props.items, store.selectCollapsedIds());
  const forbiddenIndices = forbiddenTargetIds
    .map((id) => visibleItems.findIndex((item) => item.id === id))
    .filter((index) => index !== -1);

  store.setPendingDrag({
    pendingDrag: {
      id: itemId,
      itemRects,
      containerTop: containerRect.top,
      forbiddenIndices,
      startX: payload._event.clientX,
      startY: payload._event.clientY,
    },
  });
};

export const handleWindowMouseUp = (deps) => {
  const { store, dispatchEvent, render, props } = deps;
  const isDragging = store.selectIsDragging();

  if (!isDragging) {
    if (store.selectPendingDrag()) {
      store.clearPendingDrag();
    }
    return;
  }
  const targetIndex = store.selectTargetDragIndex();
  const dropPosition = store.selectTargetDropPosition();
  const sourceId = store.selectSelectedItemId();
  const allItems = props.items || [];
  const visibleItems = getVisibleItems(allItems, store.selectCollapsedIds());
  const sourceItem = allItems.find((item) => item.id === sourceId);
  const forbiddenIndices = store.selectForbiddenIndices();
  const finishDragging = () => {
    store.stopDragging();
    render();
  };

  const isDropAllowed = isDropPlacementAllowed({
    sourceItem,
    visibleItems,
    targetIndex,
    dropPosition,
    forbiddenIndices,
  });

  if (!isDropAllowed) {
    finishDragging();
    return;
  }

  const placement = resolveDropPlacement({
    visibleItems,
    targetIndex,
    dropPosition,
  });
  const { targetItem } = placement;

  if (!sourceItem || !targetItem) {
    finishDragging();
    return;
  }

  // Don't trigger event if source and target are the same item
  if (sourceItem.id === targetItem.id) {
    finishDragging();
    return;
  }

  finishDragging();

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
  const { store, render, props } = deps;
  let isDragging = store.selectIsDragging();
  const isPrimaryButtonPressed = (payload?._event?.buttons & 1) === 1;

  if (isDragging && !isPrimaryButtonPressed) {
    deps.handlers.handleWindowMouseUp(deps);
    return;
  }

  if (!isDragging) {
    const pendingDrag = store.selectPendingDrag();
    if (!pendingDrag) {
      return;
    }

    if (!isPrimaryButtonPressed) {
      store.clearPendingDrag();
      return;
    }

    const deltaX = payload._event.clientX - pendingDrag.startX;
    const deltaY = payload._event.clientY - pendingDrag.startY;
    const dragDistance = Math.hypot(deltaX, deltaY);

    if (dragDistance < DRAG_ACTIVATION_DISTANCE) {
      return;
    }

    store.startDragging({
      id: pendingDrag.id,
      itemRects: pendingDrag.itemRects,
      containerTop: pendingDrag.containerTop,
      forbiddenIndices: pendingDrag.forbiddenIndices,
    });

    isDragging = true;
  }

  if (!isDragging) {
    return;
  }

  const itemRects = store.selectItemRects();
  const containerTop = store.selectContainerTop();
  const items = props.items || [];
  const visibleItems = getVisibleItems(items, store.selectCollapsedIds());
  const sourceId = store.selectSelectedItemId();
  const sourceItem = items.find((item) => item.id === sourceId);
  const forbiddenIndices = store.selectForbiddenIndices();

  const result = getSelectedItemIndex(
    payload._event.clientY,
    itemRects,
    0,
    items,
  );

  const isDropAllowed = isDropPlacementAllowed({
    sourceItem,
    visibleItems,
    targetIndex: result.index,
    dropPosition: result.dropPosition,
    forbiddenIndices,
  });

  if (!isDropAllowed) {
    store.setTargetDragIndex({ index: -2 });
    store.setTargetDragPosition({ position: 0 });
    store.setTargetDropPosition({ dropPosition: "none" });
    render();
    return;
  }

  const sourceIndex = visibleItems.findIndex((item) => item.id === sourceId);

  // Check if the drop position would result in no movement
  let isNoOpDrop = false;

  if (result.dropPosition === "inside") {
    // Dropping inside the source itself
    isNoOpDrop = visibleItems[result.index]?.id === sourceId;
  } else if (result.dropPosition === "above") {
    // Dropping above the source (which means index would be sourceIndex)
    isNoOpDrop = result.index === sourceIndex;
  } else if (result.dropPosition === "below") {
    // Dropping below the source (which means index would be sourceIndex)
    isNoOpDrop = result.index === sourceIndex;
  }

  // If dragging would result in no movement, hide the drag indicators
  if (isNoOpDrop) {
    store.setTargetDragIndex({ index: -2 }); // -2 means no drag indicator
    store.setTargetDragPosition({ position: 0 });
    store.setTargetDropPosition({ dropPosition: "none" });
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

  store.setTargetDragIndex({ index: result.index });
  store.setTargetDragPosition({ position: relativePosition });
  store.setTargetDropPosition({ dropPosition: result.dropPosition });
  render();
};

const subscriptions = (deps) => {
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
  const target = payload._event.target;
  if (
    typeof target?.closest === "function" &&
    target.closest("[data-item-id]")
  ) {
    return;
  }

  payload._event.preventDefault();

  const emptyContextMenuItems = Array.isArray(props.emptyContextMenuItems)
    ? props.emptyContextMenuItems
    : undefined;
  if (!emptyContextMenuItems?.length) {
    return;
  }

  // Show dropdown menu for empty space
  store.showDropdownMenuFileExplorerEmpty({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    emptyContextMenuItems,
  });
  render();
};

export const handleEmptyMessageClick = (deps, payload) => {
  const { store, render, props } = deps;
  payload._event.preventDefault();

  const emptyContextMenuItems = Array.isArray(props.emptyContextMenuItems)
    ? props.emptyContextMenuItems
    : undefined;
  if (!emptyContextMenuItems?.length) {
    return;
  }

  // Show dropdown menu when clicking on empty message
  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.showDropdownMenuFileExplorerEmpty({
    position: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    emptyContextMenuItems,
  });
  render();
};

export const handleItemContextMenu = (deps, payload) => {
  const { store, render, props } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const itemId = getItemIdFromEvent(payload._event);
  if (!itemId) {
    return;
  }

  // Find the item to get its type
  const item = props.items?.find((item) => item.id === itemId);
  const contextMenuItems = Array.isArray(props.contextMenuItems)
    ? props.contextMenuItems
    : undefined;
  const folderContextMenuItems = Array.isArray(props.folderContextMenuItems)
    ? props.folderContextMenuItems
    : undefined;
  const itemContextMenuItems = Array.isArray(props.itemContextMenuItems)
    ? props.itemContextMenuItems
    : undefined;
  const resolvedContextMenuItems = Array.isArray(item?.contextMenuItems)
    ? item.contextMenuItems
    : item?.type === "folder"
      ? (folderContextMenuItems ?? contextMenuItems)
      : (itemContextMenuItems ?? contextMenuItems);
  if (!resolvedContextMenuItems?.length) {
    return;
  }

  // Show dropdown menu for item
  store.showDropdownMenuFileExplorerItem({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    id: itemId,
    type: item?.type,
    contextMenuItems: resolvedContextMenuItems,
    folderContextMenuItems,
    itemContextMenuItems,
  });
  render();
};

export const handleItemClick = (deps, payload) => {
  const { store, render, props } = deps;
  const itemId = getItemIdFromEvent(payload._event);
  if (!itemId) {
    return;
  }
  const item = props.items?.find((entry) => entry.id === itemId);

  // Update selected item
  store.clearPendingDrag();
  store.setSelectedItemId({ itemId: itemId });
  render();
  scrollItemIntoView({ deps, itemId });
  emitItemClick({ dispatchEvent: deps.dispatchEvent, item });
};

export const handleItemDblClick = (deps, payload) => {
  const { dispatchEvent, props } = deps;
  const itemId = getItemIdFromEvent(payload._event);
  if (!itemId) {
    return;
  }
  const item = props.items?.find((entry) => entry.id === itemId);
  const isFolder = item?.type === "folder";

  dispatchEvent(
    new CustomEvent("dblclick-item", {
      detail: {
        id: itemId,
        itemId,
        item,
        isFolder,
      },
    }),
  );
};

export const handlePageItemClick = (deps, payload) => {
  const { itemId } = payload._event.detail; // Extract from forwarded event
  const item = deps.props.items?.find((entry) => entry.id === itemId);

  selectVisibleItem({ deps, item, emitSelectionEvent: false });
};

export const handleGetSelectedItem = (deps) => {
  const { props, store } = deps;
  const itemId = store.selectSelectedItemId();
  if (!itemId) {
    return undefined;
  }

  const item = props.items?.find((entry) => entry.id === itemId);
  if (!item) {
    return undefined;
  }

  return toExplorerSelection({ item, store });
};

export const handleNavigateSelection = (deps, payload) => {
  const { props, store } = deps;
  const {
    direction,
    distance = 1,
    clamp = false,
  } = payload._event.detail ?? {};
  const step =
    direction === "next" ? 1 : direction === "previous" ? -1 : undefined;
  if (!step) {
    return undefined;
  }
  const numericDistance = Number(distance);
  const itemDistance =
    Number.isFinite(numericDistance) && numericDistance > 0
      ? Math.floor(numericDistance)
      : 1;

  const visibleItems = getVisibleItems(
    props.items ?? [],
    store.selectCollapsedIds(),
  );
  if (visibleItems.length === 0) {
    return undefined;
  }

  const selectedItemId = store.selectSelectedItemId();
  const currentIndex = visibleItems.findIndex(
    (item) => item.id === selectedItemId,
  );
  let nextIndex;
  if (currentIndex === -1) {
    nextIndex = step > 0 ? 0 : visibleItems.length - 1;
  } else {
    nextIndex = currentIndex + step * itemDistance;
    if (clamp) {
      nextIndex = Math.max(0, Math.min(nextIndex, visibleItems.length - 1));
    }
  }

  const nextItem = visibleItems[nextIndex];

  if (!nextItem) {
    return undefined;
  }

  if (nextItem.id === selectedItemId) {
    return toExplorerSelection({ item: nextItem, store });
  }

  const selectedItem = selectVisibleItem({
    deps,
    item: nextItem,
    emitSelectionEvent: true,
  });
  if (!selectedItem) {
    return undefined;
  }

  return toExplorerSelection({ item: selectedItem, store });
};

export const handleSetSelectedFolderExpanded = (deps, payload) => {
  const { dispatchEvent, render, store, props } = deps;
  const { expanded } = payload._event.detail ?? {};
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return undefined;
  }

  const item = props.items?.find((entry) => entry.id === selectedItemId);
  if (!item || item.type !== "folder" || !item.hasChildren) {
    return undefined;
  }

  const isCollapsed = store.selectCollapsedIds().includes(item.id);
  if (expanded === true && !isCollapsed) {
    return {
      itemId: item.id,
      item,
      isFolder: true,
      isCollapsed,
    };
  }

  if (expanded === false && isCollapsed) {
    return {
      itemId: item.id,
      item,
      isFolder: true,
      isCollapsed,
    };
  }

  store.toggleFolderExpand({ folderId: item.id });
  render();
  scrollItemIntoView({ deps, itemId: item.id });
  const nextIsCollapsed = store.selectCollapsedIds().includes(item.id);
  emitFolderCollapseChange({
    dispatchEvent,
    folderId: item.id,
    collapsed: nextIsCollapsed,
  });

  return {
    itemId: item.id,
    item,
    isFolder: true,
    isCollapsed: nextIsCollapsed,
  };
};

export const handleArrowClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  payload._event.stopPropagation(); // Prevent triggering item click
  const folderId = getItemIdFromEvent(payload._event);
  if (!folderId) {
    return;
  }
  store.toggleFolderExpand({ folderId: folderId });
  render();
  emitFolderCollapseChange({
    dispatchEvent,
    folderId,
    collapsed: store.selectCollapsedIds().includes(folderId),
  });
};

export const handleSetFolderCollapsed = (deps, payload) => {
  const { store, render } = deps;
  const { folderId, collapsed } = payload._event.detail ?? {};
  if (!folderId) {
    return;
  }

  store.setFolderCollapsed({ folderId, collapsed });
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
  const action = detail.actionId;
  const values = detail.values;

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
