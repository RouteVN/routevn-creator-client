import { fromEvent, tap } from "rxjs";


export const handleOnMount = (deps) => {
  // const { store } = deps;
  // const { props, setItems } = store;
  // const { items } = props;
  // setItems(items)
}

/**
 *  we need to find the item that is under the mouse
 *  if mouse is above 1st item, return -1
 *  otherwise return the index of the item that is under the mouse
 *  if mouse is below the last item, return the index of the last item + 1
 *  for the gap betwen items, return to the one closest. if same distance, fallback to the top one
 * @param {number} _mouseY 
 * @param {object} itemRects 
 * @param {number} offset 
 * @returns {number}
 */
export const getSelectedItemIndex = (_mouseY, itemRects, offset) => {
  if (!itemRects) {
    return { index: -1, position: 0 };
  }

  const mouseY = _mouseY + offset;

  const sortedItems = Object.entries(itemRects)
    .filter(([id]) => id !== "container")
    .sort((a, b) => a[1].top - b[1].top)
    .map(([id, rect]) => ({ id, ...rect }));

  if (sortedItems.length === 0) {
    return { index: -1, position: 0 };
  }

  if (mouseY < sortedItems[0].top) {
    return { index: -1, position: sortedItems[0].top };
  }

  const lastItem = sortedItems[sortedItems.length - 1];
  if (mouseY > lastItem.bottom) {
    return { index: sortedItems.length - 1, position: lastItem.bottom };
  }

  for (let i = 0; i < sortedItems.length; i++) {
    const currentItem = sortedItems[i];

    if (mouseY >= currentItem.top && mouseY <= currentItem.bottom) {
      // Mouse is over an item - show line at top or bottom based on position
      const middleY = currentItem.top + (currentItem.height / 2);
      if (mouseY < middleY) {
        return { index: i - 1, position: currentItem.top };
      } else {
        return { index: i, position: currentItem.bottom };
      }
    }

    if (i < sortedItems.length - 1) {
      const nextItem = sortedItems[i + 1];
      if (mouseY > currentItem.bottom && mouseY < nextItem.top) {
        const distanceToCurrentBottom = mouseY - currentItem.bottom;
        const distanceToNextTop = nextItem.top - mouseY;

        if (distanceToCurrentBottom <= distanceToNextTop) {
          return { index: i, position: currentItem.bottom };
        } else {
          return { index: i, position: nextItem.top };
        }
      }
    }
  }

  return { index: sortedItems.length - 1, position: sortedItems[sortedItems.length - 1].bottom };
};

export const handleItemMouseDown = (e, deps) => {
  const { store, getRefIds, render } = deps;
  const refIds = getRefIds();

  // Get the container element to calculate relative positions
  const containerRect = e.currentTarget.parentElement.getBoundingClientRect();
  
  const itemRects = Object.keys(refIds).reduce((acc, key) => {
    const ref = refIds[key];
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
  
  store.startDragging({ id: e.currentTarget.id, itemRects, containerTop: containerRect.top });
  render();
};

export const handleWindowMouseUp = (e, deps) => {
  const { store, dispatchEvent, render } = deps;

  if (!store.selectIsDragging()) {
    return;
  }

  const targetIndex = store.selectTargetDragIndex();
  
  store.stopDragging();

  dispatchEvent(new CustomEvent("targetchanged", {
    detail: {
      target: targetIndex,
    },
  }));
  render();
};

export const handleWindowMouseMove = (e, deps) => {
  const isDragging = deps.store.selectIsDragging();
  
  if (!isDragging) {
    return;
  }
  const { store, render } = deps;
  const itemRects = store.selectItemRects();
  const containerTop = store.selectContainerTop();

  const result = getSelectedItemIndex(e.clientY, itemRects, -16);
  
  // Convert absolute position to relative position
  const relativePosition = result.position - containerTop;

  if (store.selectTargetDragIndex() === result.index && store.selectTargetDragPosition() === relativePosition) {
    return;
  }

  store.setTargetDragIndex(result.index);
  store.setTargetDragPosition(relativePosition);
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
  const { dispatchEvent } = deps;
  e.preventDefault();
  dispatchEvent(new CustomEvent("rightclick-container", {
    detail: {
      x: e.clientX,
      y: e.clientY,
    },
  }));
};

export const handleItemContextMenu = (e, deps) => {
  const { dispatchEvent } = deps;
  e.preventDefault();
  dispatchEvent(new CustomEvent("rightclick-item", {
    detail: {
      x: e.clientX,
      y: e.clientY,
      id: e.currentTarget.id.replace('item-', ''),
    },
  }));
};

export const handleItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(new CustomEvent("click-item", {
    detail: {
      id: e.currentTarget.id.replace('item-', ''),
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
