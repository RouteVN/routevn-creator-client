import {
  applyTagFilterPopoverSelection,
  clearTagFilterPopoverSelection,
  closeTagFilterPopoverFromOverlay,
  openTagFilterPopoverFromButton,
  toggleTagFilterPopoverOption,
} from "../../internal/ui/tagFilterPopover.handlers.js";

const DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT = 4;
const PROGRESSIVE_BATCH_ITEM_COUNT = 24;
const PROGRESSIVE_HYDRATION_DELAY_FRAME_COUNT = 1;

const getDataAttribute = (event, name) => {
  return event?.currentTarget?.getAttribute?.(name) ?? undefined;
};

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

const parseNonNegativeIntegerProp = (value, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallback;
  }

  return Math.round(numericValue);
};

const isProgressiveRenderEnabled = (props) => {
  return parseBooleanProp(props?.progressiveRender);
};

const getProgressiveInitialItemCount = (props) => {
  return parseNonNegativeIntegerProp(
    props?.progressiveInitialItemCount,
    DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT,
  );
};

const getProgressiveHydrationDelayFrameCount = (props) => {
  return parseNonNegativeIntegerProp(
    props?.progressiveHydrationDelayFrameCount,
    PROGRESSIVE_HYDRATION_DELAY_FRAME_COUNT,
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

  const renderNextBatch = () => {
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
  };

  const scheduleAfterFrames = (remainingFrameCount) => {
    const frameId = requestAnimationFrame(() => {
      if (remainingFrameCount <= 1) {
        renderNextBatch();
        return;
      }

      scheduleAfterFrames(remainingFrameCount - 1);
    });

    store.setProgressiveFrameId({ frameId });
  };

  scheduleAfterFrames(getProgressiveHydrationDelayFrameCount(props));
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
  const progressiveInitialItemCount = getProgressiveInitialItemCount(props);
  const nextRenderedItemCount = currentSignature
    ? Math.min(
        totalItemCount,
        Math.max(currentRenderedItemCount, progressiveInitialItemCount),
      )
    : Math.min(totalItemCount, progressiveInitialItemCount);
  store.setProgressiveRenderedItemCount({
    itemCount: nextRenderedItemCount,
  });

  if (nextRenderedItemCount < totalItemCount) {
    scheduleProgressiveRender(deps);
  }

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
  if (syncProgressiveRenderState(deps)) {
    scheduleSyncRender(deps);
  }
};

export const handleTagFilterButtonClick = openTagFilterPopoverFromButton;
export const handleTagFilterPopoverClose = closeTagFilterPopoverFromOverlay;
export const handleTagFilterOptionClick = toggleTagFilterPopoverOption;
export const handleTagFilterClearClick = (deps, payload) => {
  const { dispatchEvent, props } = deps;
  clearTagFilterPopoverSelection(deps, payload);

  if (
    !parseBooleanProp(props.searchInFilterPopover) ||
    !props.searchQuery?.trim()
  ) {
    return;
  }

  dispatchEvent(
    new CustomEvent("search-input", {
      detail: { value: "" },
      bubbles: true,
      composed: true,
    }),
  );
};
export const handleTagFilterApplyClick = applyTagFilterPopoverSelection;

export const handleMenuClick = (deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("menu-click", {
      bubbles: true,
      composed: true,
    }),
  );
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
  const tagIds = Array.isArray(payload._event.detail?.tagIds)
    ? payload._event.detail.tagIds
    : [];

  dispatchEvent(
    new CustomEvent("tag-filter-change", {
      detail: { tagIds },
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

export const handleItemDoubleClick = (deps, payload) => {
  const { dispatchEvent, props } = deps;
  if (parseBooleanProp(props.mobileLayout)) {
    return;
  }

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

export const handleAddButtonClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation();

  dispatchEvent(
    new CustomEvent("add-click", {
      detail: {
        groupId: getDataAttribute(payload._event, "data-group-id"),
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSpritesButtonClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation();

  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("sprites-button-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemContextMenu = (deps, payload) => {
  const { dispatchEvent, props, store, render } = deps;
  payload._event.preventDefault();

  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  if (parseBooleanProp(props.mobileLayout)) {
    dispatchEvent(
      new CustomEvent("item-click", {
        detail: { itemId, source: "context-menu" },
        bubbles: true,
        composed: true,
      }),
    );
    dispatchEvent(
      new CustomEvent("item-dblclick", {
        detail: {
          itemId,
          source: "mobile-context-menu",
        },
        bubbles: true,
        composed: true,
      }),
    );
    return;
  }

  store.showContextMenu({
    itemId,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
  dispatchEvent(
    new CustomEvent("item-click", {
      detail: { itemId, source: "context-menu" },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleCloseContextMenu = (deps) => {
  const { store, render } = deps;
  store.hideContextMenu();
  render();
};

export const handleContextMenuClickItem = (deps) => {
  const { store, render, dispatchEvent } = deps;
  const itemId = store.selectDropdownMenu().targetItemId;

  if (!itemId) {
    store.hideContextMenu();
    render();
    return;
  }

  dispatchEvent(
    new CustomEvent("item-delete", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );

  store.hideContextMenu();
  render();
};
