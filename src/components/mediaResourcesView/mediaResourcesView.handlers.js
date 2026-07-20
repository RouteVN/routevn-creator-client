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
import { dispatchResourceViewBackgroundClick } from "../../internal/ui/resourcePages/resourceViewBackground.js";

const PROGRESSIVE_INITIAL_ITEM_COUNT = 8;
const PROGRESSIVE_BATCH_ITEM_COUNT = 24;
const PROGRESSIVE_HYDRATION_DELAY_FRAME_COUNT = 1;
const SOUND_WAVEFORM_BATCH_ITEM_COUNT = 4;
const SOUND_WAVEFORM_DELAY_FRAME_COUNT = 8;
const SCROLL_STICKY_TOP_GAP_PX = 12;
const MIN_ZOOM_LEVEL = 0.5;
const MAX_ZOOM_LEVEL = 2;
const ZOOM_STEP = 0.1;
const DEFAULT_ITEMS_PER_ROW = 6;
const DEFAULT_MOBILE_ITEMS_PER_ROW = 2;
const MIN_ITEMS_PER_ROW = 1;
const MAX_ITEMS_PER_ROW = 12;
const MAX_MOBILE_ITEMS_PER_ROW = 6;

const getDataAttribute = (event, name) => {
  return event?.currentTarget?.getAttribute?.(name) ?? undefined;
};

const resolvePopoverButtonPosition = (element, { alignEnd = false } = {}) => {
  if (!element?.getBoundingClientRect) {
    return {
      x: 0,
      y: 0,
    };
  }

  const rect = element.getBoundingClientRect();

  return {
    x: Math.round(alignEnd ? rect.right : rect.left),
    y: Math.round(rect.bottom),
  };
};

const isColumnZoomControlMode = (props) => props?.zoomControlMode === "columns";

const isMobileColumnZoomControl = (props) =>
  parseBooleanProp(props?.mobileLayout) && isColumnZoomControlMode(props);

const getMaxItemsPerRow = (props) =>
  isMobileColumnZoomControl(props)
    ? MAX_MOBILE_ITEMS_PER_ROW
    : MAX_ITEMS_PER_ROW;

const getDefaultItemsPerRow = (props) =>
  isMobileColumnZoomControl(props)
    ? DEFAULT_MOBILE_ITEMS_PER_ROW
    : DEFAULT_ITEMS_PER_ROW;

const clampItemsPerRow = (value, props) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return getDefaultItemsPerRow(props);
  }

  return Math.min(
    getMaxItemsPerRow(props),
    Math.max(MIN_ITEMS_PER_ROW, Math.round(numericValue)),
  );
};

const toItemsPerRowFromColumnZoomControlValue = (value, props) => {
  return clampItemsPerRow(
    MIN_ITEMS_PER_ROW + getMaxItemsPerRow(props) - Math.round(value),
    props,
  );
};

const getMobileItemsPerRowConfigKey = (configKey) => {
  const itemsPerRowSuffix = ".itemsPerRow";
  if (configKey.endsWith(itemsPerRowSuffix)) {
    return `${configKey.slice(0, -itemsPerRowSuffix.length)}.mobileItemsPerRow`;
  }

  return `${configKey}.mobile`;
};

const getItemsPerRowConfigKey = (props) => {
  const configKey = props?.itemsPerRowConfigKey ?? undefined;
  if (!configKey) {
    return undefined;
  }

  return isMobileColumnZoomControl(props)
    ? getMobileItemsPerRowConfigKey(configKey)
    : configKey;
};

const getItemsPerRowSyncSignature = (props) => {
  if (!isColumnZoomControlMode(props)) {
    return "none";
  }

  return [
    getItemsPerRowConfigKey(props) ?? "",
    clampItemsPerRow(props?.defaultItemsPerRow, props),
    getMaxItemsPerRow(props),
  ].join("|");
};

const syncPersistedItemsPerRow = ({ appService, props, store } = {}) => {
  const signature = getItemsPerRowSyncSignature(props);
  if (store.selectItemsPerRowSyncSignature?.() === signature) {
    return false;
  }

  store.setItemsPerRowSyncSignature?.({ signature });
  if (!isColumnZoomControlMode(props)) {
    return false;
  }

  const configKey = getItemsPerRowConfigKey(props);
  const itemsPerRow =
    configKey && typeof appService?.getUserConfig === "function"
      ? appService.getUserConfig(configKey)
      : undefined;

  store.setItemsPerRow({
    itemsPerRow: clampItemsPerRow(
      itemsPerRow ?? props?.defaultItemsPerRow,
      props,
    ),
  });
  return true;
};

const persistItemsPerRow = ({ appService, props, store } = {}) => {
  const configKey = getItemsPerRowConfigKey(props);
  if (!configKey || typeof appService?.setUserConfig !== "function") {
    return;
  }

  appService.setUserConfig(
    configKey,
    clampItemsPerRow(store.selectItemsPerRow(), props),
  );
};

export const handleTagFilterButtonClick = (deps, payload) => {
  openTagFilterPopoverFromButton(deps, payload, { alignEnd: true });
};
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

export const handleZoomButtonClick = (deps, payload) => {
  const { refs, store, render } = deps;
  payload?._event?.stopPropagation?.();

  store.openZoomPopover({
    position: resolvePopoverButtonPosition(refs.zoomButton, {
      alignEnd: true,
    }),
  });
  render();
};

export const handleZoomPopoverClose = (deps) => {
  const { store, render } = deps;
  store.closeZoomPopover();
  render();
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

const isProgressiveRenderEnabled = (props) => {
  return parseBooleanProp(props?.progressiveRender);
};

const parseNonNegativeIntegerProp = (value, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallback;
  }

  return Math.round(numericValue);
};

const getProgressiveInitialItemCount = (props) => {
  return parseNonNegativeIntegerProp(
    props?.progressiveInitialItemCount,
    PROGRESSIVE_INITIAL_ITEM_COUNT,
  );
};

const getProgressiveHydrationDelayFrameCount = (props) => {
  return parseNonNegativeIntegerProp(
    props?.progressiveHydrationDelayFrameCount,
    PROGRESSIVE_HYDRATION_DELAY_FRAME_COUNT,
  );
};

const isLazySoundWaveformsEnabled = (props) => {
  return parseBooleanProp(props?.lazySoundWaveforms);
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

const getSoundWaveformItemIds = (groups = []) => {
  const itemIds = [];
  for (const group of groups) {
    for (const item of group?.children ?? []) {
      if (item?.cardKind === "sound" && item?.waveformDataFileId) {
        itemIds.push(item.id ?? "");
      }
    }
  }
  return itemIds;
};

const getSoundWaveformRenderSignature = (groups = []) => {
  return JSON.stringify(getSoundWaveformItemIds(groups));
};

const countSoundWaveformItems = (groups = []) => {
  return getSoundWaveformItemIds(groups).length;
};

const cancelProgressiveRenderFrame = (store) => {
  const frameId = store.selectProgressiveFrameId();
  if (frameId === undefined) {
    return;
  }

  cancelAnimationFrame(frameId);
  store.clearProgressiveFrameId();
};

const canManageSoundWaveformHydration = (store) => {
  return (
    typeof store.selectSoundWaveformFrameId === "function" &&
    typeof store.clearSoundWaveformFrameId === "function" &&
    typeof store.setSoundWaveformFrameId === "function" &&
    typeof store.selectSoundWaveformRenderedItemCount === "function" &&
    typeof store.setSoundWaveformRenderedItemCount === "function" &&
    typeof store.selectSoundWaveformRenderSignature === "function" &&
    typeof store.setSoundWaveformRenderSignature === "function"
  );
};

const cancelSoundWaveformRenderFrame = (store) => {
  if (!canManageSoundWaveformHydration(store)) {
    return;
  }

  const frameId = store.selectSoundWaveformFrameId();
  if (frameId === undefined) {
    return;
  }

  cancelAnimationFrame(frameId);
  store.clearSoundWaveformFrameId();
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

const scheduleSoundWaveformHydration = (deps) => {
  const { props, store, render } = deps;
  if (
    !isLazySoundWaveformsEnabled(props) ||
    !canManageSoundWaveformHydration(store)
  ) {
    return;
  }

  if (store.selectSoundWaveformFrameId() !== undefined) {
    return;
  }

  const totalItemCount = countSoundWaveformItems(props.groups);
  if (store.selectSoundWaveformRenderedItemCount() >= totalItemCount) {
    return;
  }

  const hydrateNextBatch = () => {
    store.clearSoundWaveformFrameId();

    const nextTotalItemCount = countSoundWaveformItems(deps.props.groups);
    const nextRenderedItemCount = Math.min(
      nextTotalItemCount,
      store.selectSoundWaveformRenderedItemCount() +
        SOUND_WAVEFORM_BATCH_ITEM_COUNT,
    );

    store.setSoundWaveformRenderedItemCount({
      itemCount: nextRenderedItemCount,
    });
    render();

    if (nextRenderedItemCount < nextTotalItemCount) {
      scheduleSoundWaveformHydration(deps);
    }
  };

  if (typeof globalThis.requestAnimationFrame !== "function") {
    store.setSoundWaveformRenderedItemCount({ itemCount: totalItemCount });
    render();
    return;
  }

  const scheduleAfterFrames = (remainingFrameCount) => {
    const frameId = requestAnimationFrame(() => {
      if (remainingFrameCount <= 1) {
        hydrateNextBatch();
        return;
      }

      scheduleAfterFrames(remainingFrameCount - 1);
    });

    store.setSoundWaveformFrameId({ frameId });
  };

  scheduleAfterFrames(SOUND_WAVEFORM_DELAY_FRAME_COUNT);
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

const syncSoundWaveformHydrationState = (deps) => {
  const { props, store } = deps;
  if (!canManageSoundWaveformHydration(store)) {
    return false;
  }

  const groups = props.groups ?? [];
  const totalItemCount = countSoundWaveformItems(groups);
  const lazySoundWaveformsEnabled = isLazySoundWaveformsEnabled(props);

  if (!lazySoundWaveformsEnabled) {
    const didChange =
      store.selectSoundWaveformRenderSignature() !== "" ||
      store.selectSoundWaveformRenderedItemCount() !== totalItemCount;
    cancelSoundWaveformRenderFrame(store);
    store.setSoundWaveformRenderSignature({ signature: "" });
    store.setSoundWaveformRenderedItemCount({ itemCount: totalItemCount });
    return didChange;
  }

  const nextSignature = getSoundWaveformRenderSignature(groups);
  const currentSignature = store.selectSoundWaveformRenderSignature();

  if (nextSignature === currentSignature) {
    if (store.selectSoundWaveformRenderedItemCount() < totalItemCount) {
      scheduleSoundWaveformHydration(deps);
    }
    return false;
  }

  cancelSoundWaveformRenderFrame(store);
  store.setSoundWaveformRenderSignature({ signature: nextSignature });
  store.setSoundWaveformRenderedItemCount({ itemCount: 0 });

  if (totalItemCount > 0) {
    scheduleSoundWaveformHydration(deps);
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
  syncPersistedItemsPerRow(deps);
  syncProgressiveRenderState(deps);
  syncSoundWaveformHydrationState(deps);

  return () => {
    cancelProgressiveRenderFrame(deps.store);
    cancelSoundWaveformRenderFrame(deps.store);
    cancelScheduledSyncRender(deps.store);
  };
};

export const handleOnUpdate = (deps) => {
  const didItemsPerRowChange = syncPersistedItemsPerRow(deps);
  const didProgressiveRenderChange = syncProgressiveRenderState(deps);
  const didSoundWaveformHydrationChange = syncSoundWaveformHydrationState(deps);

  if (
    didItemsPerRowChange ||
    didProgressiveRenderChange ||
    didSoundWaveformHydrationChange
  ) {
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

export const handleMenuClick = (deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("menu-click", {
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
  const { dispatchEvent, store, render } = deps;
  const groupId = getDataAttribute(payload._event, "data-group-id");
  if (!groupId) {
    return;
  }

  store.toggleGroupCollapse({ groupId });
  render();
  dispatchEvent(
    new CustomEvent("group-collapse-change", {
      detail: {
        groupId,
        collapsed: store.selectCollapsedIds().includes(groupId),
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleScrollContainerClick = dispatchResourceViewBackgroundClick;

export const handleSetGroupCollapsed = (deps, payload = {}) => {
  const { store, render } = deps;
  const { groupId, collapsed } = payload;
  if (!groupId) {
    return;
  }

  store.setGroupCollapsed({ groupId, collapsed });
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
        x: payload._event.clientX,
        y: payload._event.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleZoomChange = (deps, payload) => {
  const { store, render, props } = deps;
  if (!parseBooleanProp(props.showZoomControls)) {
    return false;
  }

  const nextValue = parseFloat(
    payload._event.detail?.value ?? payload._event.target?.value ?? 1,
  );

  if (isColumnZoomControlMode(props)) {
    store.setItemsPerRow({
      itemsPerRow: toItemsPerRowFromColumnZoomControlValue(nextValue, props),
    });
    persistItemsPerRow(deps);
    render();
    return true;
  }

  const zoomLevel = Math.min(
    MAX_ZOOM_LEVEL,
    Math.max(MIN_ZOOM_LEVEL, nextValue),
  );
  store.setZoomLevel({ zoomLevel });
  render();
  return true;
};

export const handleZoomIn = (deps) => {
  const { store, render, props } = deps;
  if (!parseBooleanProp(props.showZoomControls)) {
    return false;
  }

  if (isColumnZoomControlMode(props)) {
    store.setItemsPerRow({
      itemsPerRow: clampItemsPerRow(store.selectItemsPerRow() - 1, props),
    });
    persistItemsPerRow(deps);
    render();
    return true;
  }

  const zoomLevel = Math.min(
    MAX_ZOOM_LEVEL,
    store.selectZoomLevel() + ZOOM_STEP,
  );
  store.setZoomLevel({ zoomLevel });
  render();
  return true;
};

export const handleZoomOut = (deps) => {
  const { store, render, props } = deps;
  if (!parseBooleanProp(props.showZoomControls)) {
    return false;
  }

  if (isColumnZoomControlMode(props)) {
    store.setItemsPerRow({
      itemsPerRow: clampItemsPerRow(store.selectItemsPerRow() + 1, props),
    });
    persistItemsPerRow(deps);
    render();
    return true;
  }

  const zoomLevel = Math.max(
    MIN_ZOOM_LEVEL,
    store.selectZoomLevel() - ZOOM_STEP,
  );
  store.setZoomLevel({ zoomLevel });
  render();
  return true;
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
