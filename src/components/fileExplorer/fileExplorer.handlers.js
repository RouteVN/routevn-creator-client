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
    return -1;
  }

  const mouseY = _mouseY + offset;

  const sortedItems = Object.entries(itemRects)
    .filter(([id]) => id !== "container")
    .sort((a, b) => a[1].top - b[1].top)
    .map(([id, rect]) => ({ id, ...rect }));

  if (sortedItems.length === 0) {
    return -1;
  }

  if (mouseY < sortedItems[0].top) {
    return -1;
  }

  const lastItem = sortedItems[sortedItems.length - 1];
  if (mouseY > lastItem.bottom) {
    return sortedItems.length - 1;
  }

  for (let i = 0; i < sortedItems.length; i++) {
    const currentItem = sortedItems[i];

    if (mouseY >= currentItem.top && mouseY <= currentItem.bottom) {
      return i;
    }

    if (i < sortedItems.length - 1) {
      const nextItem = sortedItems[i + 1];
      if (mouseY > currentItem.bottom && mouseY < nextItem.top) {
        const distanceToCurrentBottom = mouseY - currentItem.bottom;
        const distanceToNextTop = nextItem.top - mouseY;

        return distanceToCurrentBottom <= distanceToNextTop ? i : i + 1;
      }
    }
  }

  return sortedItems.length - 1;
};

export const handleItemClick = (e, deps) => {
  console.log("item clicked", e.currentTarget.id);
};

export const handleItemMouseDown = (e, deps) => {
  const { store, getRefIds } = deps;
  const refIds = getRefIds();
  console.log('refIds', refIds)

  const itemRects = Object.keys(refIds).reduce((acc, key) => {
    const ref = refIds[key];
    const rect = ref.elm.getBoundingClientRect();
    acc[key] = {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      y: rect.top,
    };
    return acc;
  }, {});
  store.startDragging({ id: e.currentTarget.id, itemRects });
};

export const handleWindowMouseUp = (e, deps) => {
  const { store, dispatchEvent, render } = deps;

  if (!store.selectIsDragging() ) {
    return;
  }

  store.stopDragging();

  dispatchEvent(new CustomEvent("targetchanged", {
    detail: {
      target: store.selectTargetDragIndex(),
    },
  }));
  render();
};

export const handleWindowMouseMove = (e, deps) => {
  if (!deps.store.selectIsDragging()) {
    return;
  }
  const { store, render } = deps;
  const itemRects = store.selectItemRects();

  const selectedItemIndex = getSelectedItemIndex(e.clientY, itemRects, -16);

  console.log('selectedItemIndex', selectedItemIndex)

  if (store.selectTargetDragIndex() === selectedItemIndex) {
    return;
  }

  store.setTargetDragIndex(selectedItemIndex);
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

