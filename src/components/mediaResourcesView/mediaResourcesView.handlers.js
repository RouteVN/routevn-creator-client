import {
  getAcceptAttribute,
  isFileTypeAccepted,
} from "../../internal/fileTypes.js";
import {
  applyTagFilterPopoverSelection,
  clearTagFilterPopoverSelection,
  closeTagFilterPopoverFromOverlay,
  openTagFilterPopoverFromButton,
  toggleTagFilterPopoverOption,
} from "../../internal/ui/tagFilterPopover.handlers.js";

const PROGRESSIVE_INITIAL_ITEM_COUNT = 8;
const PROGRESSIVE_BATCH_ITEM_COUNT = 24;
const SCROLL_STICKY_TOP_GAP_PX = 12;

const getDataAttribute = (event, name) => {
  return event?.currentTarget?.getAttribute?.(name) ?? undefined;
};

export const handleTagFilterButtonClick = openTagFilterPopoverFromButton;
export const handleTagFilterPopoverClose = closeTagFilterPopoverFromOverlay;
export const handleTagFilterOptionClick = toggleTagFilterPopoverOption;
export const handleTagFilterClearClick = clearTagFilterPopoverSelection;
export const handleTagFilterApplyClick = applyTagFilterPopoverSelection;

const parseBooleanProp = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (value === true || value === "") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return Boolean(value);
};

const isProgressiveRenderEnabled = (props) => {
  return parseBooleanProp(
    props?.progressiveRender ?? props?.["progressive-render"],
  );
};

const getProgressiveRenderSignature = (groups = []) => {
  return JSON.stringify(
    groups.map((group) => [
      group?.id ?? "",
      (group?.children ?? []).map((item) => item?.id ?? ""),
    ]),
  );
};

const countProgressiveItems = (groups = []) => {
  return groups.reduce((sum, group) => sum + (group?.children?.length ?? 0), 0);
};

const cancelProgressiveRenderFrame = (store) => {
  const frameId = store.selectProgressiveFrameId();
  if (frameId === undefined) {
    return;
  }

  cancelAnimationFrame(frameId);
  store.clearProgressiveFrameId();
};

const cancelScheduledSyncRender = (store) => {
  const frameId = store.selectSyncRenderFrameId?.();
  if (frameId === undefined) {
    return;
  }

  cancelAnimationFrame(frameId);
  store.clearSyncRenderFrameId?.();
};

const scheduleSyncRender = (deps) => {
  const { render, store } = deps;
  if (typeof store.selectSyncRenderFrameId === "function") {
    const activeFrameId = store.selectSyncRenderFrameId();
    if (activeFrameId !== undefined) {
      return;
    }
  }

  if (typeof globalThis.requestAnimationFrame !== "function") {
    render();
    return;
  }

  const frameId = globalThis.requestAnimationFrame(() => {
    store.clearSyncRenderFrameId?.();
    render();
  });

  store.setSyncRenderFrameId?.({
    frameId,
  });
};

const scheduleProgressiveRender = (deps) => {
  const { props, store, render } = deps;
  if (!isProgressiveRenderEnabled(props)) {
    return;
  }

  if (store.selectProgressiveFrameId() !== undefined) {
    return;
  }

  const totalItemCount = countProgressiveItems(props.groups);
  if (store.selectProgressiveRenderedItemCount() >= totalItemCount) {
    return;
  }

  const frameId = requestAnimationFrame(() => {
    store.clearProgressiveFrameId();

    const nextTotalItemCount = countProgressiveItems(deps.props.groups);
    const nextRenderedItemCount = Math.min(
      nextTotalItemCount,
      store.selectProgressiveRenderedItemCount() + PROGRESSIVE_BATCH_ITEM_COUNT,
    );

    store.setProgressiveRenderedItemCount({
      itemCount: nextRenderedItemCount,
    });
    render();

    if (nextRenderedItemCount < nextTotalItemCount) {
      scheduleProgressiveRender(deps);
    }
  });

  store.setProgressiveFrameId({ frameId });
};

const syncProgressiveRenderState = (deps) => {
  const { props, store } = deps;
  const progressiveRenderEnabled = isProgressiveRenderEnabled(props);
  const groups = props.groups ?? [];
  const totalItemCount = countProgressiveItems(groups);

  if (!progressiveRenderEnabled) {
    cancelProgressiveRenderFrame(store);
    store.setProgressiveRenderSignature({ signature: "" });
    store.setProgressiveRenderedItemCount({ itemCount: totalItemCount });
    return true;
  }

  const nextSignature = getProgressiveRenderSignature(groups);
  const currentSignature = store.selectProgressiveRenderSignature();
  const currentRenderedItemCount = store.selectProgressiveRenderedItemCount();

  if (nextSignature === currentSignature) {
    if (store.selectProgressiveRenderedItemCount() < totalItemCount) {
      scheduleProgressiveRender(deps);
    }
    return false;
  }

  cancelProgressiveRenderFrame(store);
  store.setProgressiveRenderSignature({ signature: nextSignature });
  const nextRenderedItemCount = currentSignature
    ? Math.min(
        totalItemCount,
        Math.max(currentRenderedItemCount, PROGRESSIVE_INITIAL_ITEM_COUNT),
      )
    : Math.min(totalItemCount, PROGRESSIVE_INITIAL_ITEM_COUNT);
  store.setProgressiveRenderedItemCount({
    itemCount: nextRenderedItemCount,
  });

  if (nextRenderedItemCount < totalItemCount) {
    scheduleProgressiveRender(deps);
  }

  return true;
};

const hasPreviewableItems = (groups = []) => {
  return groups.some((group) =>
    (group?.children ?? []).some((item) => item?.canPreview),
  );
};

const resolveItemRenderTarget = ({
  groups = [],
  collapsedIds = [],
  itemId,
} = {}) => {
  if (!itemId) {
    return undefined;
  }

  let visibleItemCount = 0;

  for (const group of groups) {
    const children = group?.children ?? [];
    const itemIndex = children.findIndex((item) => item?.id === itemId);
    const isCollapsed = collapsedIds.includes(group?.id);

    if (itemIndex === -1) {
      if (!isCollapsed) {
        visibleItemCount += children.length;
      }
      continue;
    }

    if (isCollapsed) {
      return {
        itemId,
        isCollapsed: true,
      };
    }

    return {
      itemId,
      isCollapsed: false,
      requiredRenderedItemCount: visibleItemCount + itemIndex + 1,
    };
  }

  return undefined;
};

const getItemElement = (containerElement, itemId) => {
  if (!containerElement || !itemId) {
    return undefined;
  }

  return Array.from(containerElement.querySelectorAll("[data-item-id]")).find(
    (element) => element.getAttribute("data-item-id") === itemId,
  );
};

const getStickyTopOffset = (itemElement) => {
  const groupElement = itemElement?.closest?.("[data-group-id]");
  const stickyHeaderElement = groupElement?.firstElementChild;
  return (stickyHeaderElement?.offsetHeight ?? 0) + SCROLL_STICKY_TOP_GAP_PX;
};

const isItemFullyVisible = (containerElement, itemElement) => {
  if (!containerElement || !itemElement) {
    return false;
  }

  const containerRect = containerElement.getBoundingClientRect();
  const itemRect = itemElement.getBoundingClientRect();
  const stickyTopOffset = getStickyTopOffset(itemElement);
  const visibleTop = containerRect.top + stickyTopOffset;

  if (itemRect.height >= containerRect.height - stickyTopOffset) {
    return itemRect.top < containerRect.bottom && itemRect.bottom > visibleTop;
  }

  return itemRect.top >= visibleTop && itemRect.bottom <= containerRect.bottom;
};

const scrollRenderedItemIntoView = ({
  refs,
  itemId,
  behavior = "auto",
} = {}) => {
  const containerElement = refs.scrollContainer;
  const itemElement = getItemElement(containerElement, itemId);

  if (!containerElement || !itemElement) {
    return false;
  }

  if (isItemFullyVisible(containerElement, itemElement)) {
    return false;
  }

  const containerRect = containerElement.getBoundingClientRect();
  const itemRect = itemElement.getBoundingClientRect();
  const stickyTopOffset = getStickyTopOffset(itemElement);
  const visibleTop = containerRect.top + stickyTopOffset;

  let targetScrollTop = containerElement.scrollTop;

  if (itemRect.top < visibleTop) {
    targetScrollTop += itemRect.top - visibleTop;
  } else if (itemRect.bottom > containerRect.bottom) {
    targetScrollTop += itemRect.bottom - containerRect.bottom;
  } else {
    return false;
  }

  containerElement.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior,
  });
  return true;
};

export const handleBeforeMount = (deps) => {
  syncProgressiveRenderState(deps);

  return () => {
    cancelProgressiveRenderFrame(deps.store);
    cancelScheduledSyncRender(deps.store);
  };
};

export const handleOnUpdate = (deps) => {
  const didChange = syncProgressiveRenderState(deps);
  if (didChange) {
    scheduleSyncRender(deps);
  }
};

export const handleScrollItemIntoView = (deps, payload = {}) => {
  const { refs, props, store, render } = deps;
  const { itemId, behavior = "auto" } = payload;

  if (!itemId) {
    return false;
  }

  const target = resolveItemRenderTarget({
    groups: props.groups ?? [],
    collapsedIds: store.selectCollapsedIds(),
    itemId,
  });

  if (!target || target.isCollapsed) {
    return false;
  }

  if (
    isProgressiveRenderEnabled(props) &&
    target.requiredRenderedItemCount >
      store.selectProgressiveRenderedItemCount()
  ) {
    store.setProgressiveRenderedItemCount({
      itemCount: target.requiredRenderedItemCount,
    });
    render();
  }

  requestAnimationFrame(() => {
    scrollRenderedItemIntoView({
      refs,
      itemId,
      behavior,
    });
  });

  return true;
};

export const handleSearchInput = (deps, payload) => {
  const { dispatchEvent } = deps;
  const value = payload._event.detail.value ?? "";

  dispatchEvent(
    new CustomEvent("search-input", {
      detail: { value },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleTagFilterChange = (deps, payload) => {
  const { dispatchEvent } = deps;
  const tagIds = Array.isArray(payload._event.detail?.value)
    ? payload._event.detail.value
    : [];

  dispatchEvent(
    new CustomEvent("tag-filter-change", {
      detail: { tagIds },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBackClick = (deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-click", {
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDragEnter = (deps, payload) => {
  const { store, render, props } = deps;
  if (props.canUpload === false) {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();

  const groupId = getDataAttribute(payload._event, "data-group-id");
  if (!groupId) {
    return;
  }

  store.setDraggingGroupId({ groupId });
  render();
};

export const handleDragOver = (deps, payload) => {
  payload._event.preventDefault();
  payload._event.stopPropagation();
};

export const handleDragLeave = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const relatedTarget = payload._event.relatedTarget;
  const currentTarget = payload._event.currentTarget;

  if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
    store.setDraggingGroupId({ groupId: undefined });
    render();
  }
};

export const handleDrop = (deps, payload) => {
  const { dispatchEvent, store, render, props } = deps;
  if (props.canUpload === false) {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();

  const targetGroupId = store.selectDraggingGroupId();
  store.setDraggingGroupId({ groupId: undefined });
  render();

  const droppedFiles = Array.from(payload._event.dataTransfer?.files ?? []);
  const files = droppedFiles.filter((file) =>
    isFileTypeAccepted(file, props.acceptedFileTypes),
  );
  const rejectedFiles = droppedFiles.filter(
    (file) => !isFileTypeAccepted(file, props.acceptedFileTypes),
  );

  if (rejectedFiles.length > 0) {
    dispatchEvent(
      new CustomEvent("files-drop-rejected", {
        detail: {
          rejectedFiles,
          targetGroupId,
          accept: getAcceptAttribute(props.acceptedFileTypes),
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  if (!files.length) {
    return;
  }

  dispatchEvent(
    new CustomEvent("files-dropped", {
      detail: {
        files,
        rejectedFiles,
        targetGroupId,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = getDataAttribute(payload._event, "data-group-id");
  if (!groupId) {
    return;
  }

  store.toggleGroupCollapse({ groupId });
  render();
};

export const handleItemClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemMouseEnter = (deps, payload) => {
  const { store, render, props } = deps;
  if (!hasPreviewableItems(props.groups)) {
    return;
  }

  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId || store.selectHoveredItemId() === itemId) {
    return;
  }

  store.setHoveredItemId({ itemId });
  render();
};

export const handleItemMouseLeave = (deps) => {
  const { store, render, props } = deps;
  if (!hasPreviewableItems(props.groups)) {
    return;
  }

  if (store.selectHoveredItemId() === undefined) {
    return;
  }

  store.setHoveredItemId({ itemId: undefined });
  render();
};

export const handleItemDoubleClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-dblclick", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePreviewActionClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation();

  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-preview", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleUploadButtonClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation();

  dispatchEvent(
    new CustomEvent("upload-click", {
      detail: {
        groupId: getDataAttribute(payload._event, "data-group-id"),
        accept: getAcceptAttribute(deps.props.acceptedFileTypes),
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleZoomChange = (deps, payload) => {
  const { store, render } = deps;
  const nextZoomLevel = parseFloat(
    payload._event.detail?.value ?? payload._event.target?.value ?? 1,
  );
  const zoomLevel = Math.min(2, Math.max(0.5, nextZoomLevel));

  store.setZoomLevel({ zoomLevel });
  render();
};

export const handleZoomIn = (deps) => {
  const { store, render } = deps;
  const zoomLevel = Math.min(2, store.selectZoomLevel() + 0.1);
  store.setZoomLevel({ zoomLevel });
  render();
};

export const handleZoomOut = (deps) => {
  const { store, render } = deps;
  const zoomLevel = Math.max(0.5, store.selectZoomLevel() - 0.1);
  store.setZoomLevel({ zoomLevel });
  render();
};

export const handleItemContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  store.showContextMenu({
    itemId,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handleCloseContextMenu = (deps) => {
  const { store, render } = deps;
  store.hideContextMenu();
  render();
};

export const handleContextMenuClickItem = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const action = payload._event.detail.item?.value;
  const itemId = store.selectDropdownMenu().targetItemId;

  if (!itemId) {
    store.hideContextMenu();
    render();
    return;
  }

  if (action === "edit-item") {
    dispatchEvent(
      new CustomEvent("item-edit", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  if (action === "preview-item") {
    dispatchEvent(
      new CustomEvent("item-preview", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  if (action === "delete-item") {
    dispatchEvent(
      new CustomEvent("item-delete", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  store.hideContextMenu();
  render();
};
