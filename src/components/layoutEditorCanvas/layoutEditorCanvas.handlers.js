import { debounceTime, filter, fromEvent, tap } from "rxjs";
import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import { captureCanvasThumbnailImage } from "../../internal/runtime/graphicsEngineRuntime.js";
import {
  createLayoutEditorRenderedElements,
  loadLayoutEditorAssets,
} from "./support/layoutEditorCanvasRender.js";

const KEYBOARD_SAVE_DELAY = 1000;

const KEYBOARD_UNITS = {
  NORMAL: 1,
  FAST: 10,
};

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const requireCanvasResolution = (props = {}) => {
  return requireProjectResolution(
    props.resolution ?? DEFAULT_PROJECT_RESOLUTION,
    "Layout editor canvas resolution",
  );
};

const getSelectedItem = (props = {}, pendingUpdatedItem) => {
  if (pendingUpdatedItem) {
    return pendingUpdatedItem;
  }

  const itemId = props.selectedItemId;
  const item = props.layoutState?.elements?.items?.[itemId];
  if (!itemId || !item) {
    return undefined;
  }

  return {
    id: itemId,
    ...item,
  };
};

const toStoredItem = (item = {}) => {
  const nextItem = {};

  for (const [key, value] of Object.entries(item)) {
    if (key === "id") {
      continue;
    }

    nextItem[key] = value;
  }

  return nextItem;
};

const createLayoutDataWithUpdatedItem = (layoutData, updatedItem) => {
  if (!updatedItem?.id) {
    return layoutData;
  }

  const nextItems = Object.assign({}, layoutData?.items);
  nextItems[updatedItem.id] = toStoredItem(updatedItem);

  return {
    tree: layoutData?.tree ?? [],
    items: nextItems,
  };
};

const getRepositoryState = async (deps) => {
  await deps.projectService.ensureRepository();
  return deps.projectService.getRepositoryState();
};

const areCanvasItemsEquivalent = (left, right) => {
  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
};

export const applyCanvasItemDragChange = ({
  item,
  dragStartPosition,
  x,
  y,
} = {}) => {
  if (
    !item ||
    !dragStartPosition ||
    typeof x !== "number" ||
    typeof y !== "number"
  ) {
    return item;
  }

  return {
    ...item,
    x: dragStartPosition.itemStartX + x - dragStartPosition.x,
    y: dragStartPosition.itemStartY + y - dragStartPosition.y,
  };
};

export const applyCanvasItemKeyboardChange = ({
  item,
  key,
  unit = 1,
  resize = false,
} = {}) => {
  if (!item || typeof key !== "string") {
    return item;
  }

  let change;

  if (key === "ArrowUp") {
    change = resize
      ? { height: Math.round(item.height - unit) }
      : { y: Math.round(item.y - unit) };
  } else if (key === "ArrowDown") {
    change = resize
      ? { height: Math.round(item.height + unit) }
      : { y: Math.round(item.y + unit) };
  } else if (key === "ArrowLeft") {
    change = resize
      ? { width: Math.round(item.width - unit) }
      : { x: Math.round(item.x - unit) };
  } else if (key === "ArrowRight") {
    change = resize
      ? { width: Math.round(item.width + unit) }
      : { x: Math.round(item.x + unit) };
  } else {
    return item;
  }

  return {
    ...item,
    ...change,
  };
};

const dispatchCanvasItemEvent = (deps, eventName, updatedItem) => {
  if (!updatedItem?.id) {
    return;
  }

  deps.dispatchEvent(
    new CustomEvent(eventName, {
      detail: {
        itemId: updatedItem.id,
        updatedItem,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const renderLayoutEditorCanvas = async (
  deps,
  props = deps.props,
  { clearFirst = false, updatedItem } = {},
) => {
  try {
    const repositoryState = await getRepositoryState(deps);
    const layoutData = updatedItem
      ? createLayoutDataWithUpdatedItem(
          props.layoutState?.elements,
          updatedItem,
        )
      : props.layoutState?.elements;
    const layoutState = {
      id: props.layoutState?.id,
      layoutType: props.layoutState?.layoutType,
      elements: layoutData,
    };
    const { elements, fileReferences } = createLayoutEditorRenderedElements({
      layoutState,
      repositoryState,
      previewData: props.previewData,
      selectedItemId: props.selectedItemId,
      graphicsService: deps.graphicsService,
    });

    if (clearFirst) {
      deps.graphicsService.render({
        id: `layout-editor-preview-clear-${Date.now()}`,
        elements: [],
        animations: [],
      });
    }

    let assets = await loadLayoutEditorAssets({
      projectService: deps.projectService,
      selectCachedFileContent: deps.store.selectCachedFileContent,
      clearCachedFileContent: deps.store.clearCachedFileContent,
      cacheFileContent: deps.store.cacheFileContent,
      fileReferences,
      fontsItems: repositoryState?.fonts?.items || {},
    });
    try {
      await deps.graphicsService.loadAssets(assets);
    } catch {
      deps.store.clearFileContentCache();
      assets = await loadLayoutEditorAssets({
        projectService: deps.projectService,
        selectCachedFileContent: deps.store.selectCachedFileContent,
        clearCachedFileContent: deps.store.clearCachedFileContent,
        cacheFileContent: deps.store.cacheFileContent,
        fileReferences,
        fontsItems: repositoryState?.fonts?.items || {},
      });
      await deps.graphicsService.loadAssets(assets);
    }

    deps.graphicsService.render({
      elements,
      animations: [],
    });
  } catch (error) {
    console.error("[layoutEditorCanvas] Failed to render canvas", error);
  }
};

const initCanvasGraphics = async (deps, props = deps.props) => {
  const { width, height } = requireCanvasResolution(props);

  await deps.graphicsService.init({
    canvas: deps.refs.canvas,
    width,
    height,
  });
};

export const handleCaptureThumbnailImage = async (deps) => {
  return captureCanvasThumbnailImage(deps.graphicsService, deps.refs.canvas);
};

const handleKeyboardMove = async (deps, event) => {
  const pendingUpdatedItem = deps.store.selectPendingUpdatedItem();
  const currentItem = getSelectedItem(deps.props, pendingUpdatedItem);
  if (!currentItem) {
    return;
  }

  event.preventDefault();

  const updatedItem = applyCanvasItemKeyboardChange({
    item: currentItem,
    key: event.key,
    unit: event.shiftKey ? KEYBOARD_UNITS.FAST : KEYBOARD_UNITS.NORMAL,
    resize: event.metaKey,
  });

  deps.store.setPendingUpdatedItem({ updatedItem });
  await renderLayoutEditorCanvas(deps, deps.props, { updatedItem });
  dispatchCanvasItemEvent(deps, "drag-update", updatedItem);
  deps.subject.dispatch("layoutEditorCanvas.keyboardNavigationMoved", {
    itemId: currentItem.id,
  });
};

const handleBorderDragStart = (deps) => {
  const currentItem = getSelectedItem(
    deps.props,
    deps.store.selectPendingUpdatedItem(),
  );
  if (!currentItem) {
    return;
  }

  deps.store.startDragging();
  deps.render();
};

const handleBorderDragMove = async (deps, payload = {}) => {
  if (typeof payload.x !== "number" || typeof payload.y !== "number") {
    return;
  }

  const currentItem = getSelectedItem(
    deps.props,
    deps.store.selectPendingUpdatedItem(),
  );
  if (!currentItem) {
    return;
  }

  const dragging = deps.store.selectDragging();
  if (!dragging.dragStartPosition) {
    deps.store.setDragStartPosition({
      x: payload.x,
      y: payload.y,
      itemStartX: currentItem.x,
      itemStartY: currentItem.y,
    });
    return;
  }

  const updatedItem = applyCanvasItemDragChange({
    item: currentItem,
    dragStartPosition: dragging.dragStartPosition,
    x: payload.x,
    y: payload.y,
  });

  deps.store.setPendingUpdatedItem({ updatedItem });
  await renderLayoutEditorCanvas(deps, deps.props, { updatedItem });
  dispatchCanvasItemEvent(deps, "drag-update", updatedItem);
};

const handleBorderDragEnd = async (deps) => {
  const pendingUpdatedItem = deps.store.selectPendingUpdatedItem();

  deps.store.stopDragging();
  deps.render();

  if (!pendingUpdatedItem) {
    return;
  }

  await renderLayoutEditorCanvas(deps, deps.props, {
    updatedItem: pendingUpdatedItem,
  });
  dispatchCanvasItemEvent(deps, "update", pendingUpdatedItem);
};

const subscriptions = (deps) => {
  const { appService, subject } = deps;

  return [
    fromEvent(window, "keydown").pipe(
      filter((event) => {
        if (appService.isInputFocused()) {
          return false;
        }

        return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          event.key,
        );
      }),
      tap((event) => {
        handleKeyboardMove(deps, event);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-start"),
      tap(() => {
        handleBorderDragStart(deps);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-move"),
      tap(({ payload }) => {
        handleBorderDragMove(deps, payload);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-end"),
      tap(() => {
        handleBorderDragEnd(deps);
      }),
    ),
    subject.pipe(
      filter(
        ({ action }) => action === "layoutEditorCanvas.keyboardNavigationMoved",
      ),
      debounceTime(KEYBOARD_SAVE_DELAY),
      tap(async ({ payload }) => {
        const pendingUpdatedItem = deps.store.selectPendingUpdatedItem();
        if (!pendingUpdatedItem || pendingUpdatedItem.id !== payload?.itemId) {
          return;
        }

        dispatchCanvasItemEvent(deps, "update", pendingUpdatedItem);
      }),
    ),
  ];
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);

  return () => {
    cleanupSubscriptions?.();
    void deps.graphicsService.destroy();
  };
};

export const handleAfterMount = async (deps) => {
  await initCanvasGraphics(deps);
  await renderLayoutEditorCanvas(deps);
};

export const restartPreview = async (deps) => {
  await renderLayoutEditorCanvas(deps, deps.props, {
    clearFirst: true,
    updatedItem: deps.store.selectPendingUpdatedItem(),
  });
};

export const handleOnUpdate = async (deps, changes) => {
  const { oldProps = {}, newProps = {} } = changes;
  const didResolutionChange =
    oldProps.resolution?.width !== newProps.resolution?.width ||
    oldProps.resolution?.height !== newProps.resolution?.height;

  if (didResolutionChange) {
    await initCanvasGraphics(deps, newProps);
  }

  const pendingUpdatedItem = deps.store.selectPendingUpdatedItem();
  if (pendingUpdatedItem && newProps.selectedItemId !== pendingUpdatedItem.id) {
    deps.store.clearPendingUpdatedItem();
  }

  const nextSelectedItem = getSelectedItem(newProps);
  if (
    areCanvasItemsEquivalent(
      nextSelectedItem,
      deps.store.selectPendingUpdatedItem(),
    )
  ) {
    deps.store.clearPendingUpdatedItem();
  }

  await renderLayoutEditorCanvas(deps, newProps, {
    updatedItem: deps.store.selectPendingUpdatedItem(),
  });
};
