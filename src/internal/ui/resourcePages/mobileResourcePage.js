import { MOBILE_SAFE_AREA_INSET_BOTTOM_VALUE } from "../mobileSafeAreaInsets.js";

export const isTouchUiConfig = (uiConfig) =>
  uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";

export const MOBILE_RESOURCE_SCROLL_BOTTOM_PADDING = `calc(96px + ${MOBILE_SAFE_AREA_INSET_BOTTOM_VALUE})`;

export const resolveResourceScrollBottomPadding = ({
  mobileLayout,
  scrollBottomPadding,
} = {}) => {
  const hasScrollBottomPadding =
    scrollBottomPadding !== undefined &&
    scrollBottomPadding !== "undefined" &&
    scrollBottomPadding !== "";

  return (
    (hasScrollBottomPadding ? scrollBottomPadding : undefined) ??
    (mobileLayout ? MOBILE_RESOURCE_SCROLL_BOTTOM_PADDING : "0px")
  );
};

export const createMobileResourcePageState = () => ({
  isTouchMode: false,
  isMobileFileExplorerOpen: false,
  suppressMobileDetailSheet: false,
});

export const setMobileResourcePageUiConfigState = (
  state,
  { uiConfig, clearSearchOnTouch = true } = {},
) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
  if (state.isTouchMode && clearSearchOnTouch) {
    state.searchQuery = "";
  }
};

export const openMobileResourceFileExplorerState = (state) => {
  state.isMobileFileExplorerOpen = true;
};

export const closeMobileResourceFileExplorerState = (state) => {
  state.isMobileFileExplorerOpen = false;
};

export const setMobileResourceDetailSheetSuppressedState = (
  state,
  { itemId, suppressMobileDetailSheet = false } = {},
) => {
  state.suppressMobileDetailSheet = Boolean(
    itemId && suppressMobileDetailSheet,
  );
};

export const selectIsTouchModeState = ({ state }) => state.isTouchMode;

export const selectIsMobileFileExplorerOpenState = ({ state }) =>
  state.isMobileFileExplorerOpen;

export const selectSuppressMobileDetailSheetState = ({ state }) =>
  state.suppressMobileDetailSheet;

export const buildMobileResourcePageViewData = ({
  state,
  detailFields = [],
  hiddenMobileDetailSlots = [],
} = {}) => {
  const hiddenSlotSet = new Set(hiddenMobileDetailSlots);
  const mobileDetailFields = detailFields.filter(
    (field) => !hiddenSlotSet.has(field?.slot),
  );

  return {
    isTouchMode: state.isTouchMode,
    showExplorerPanel: !state.isTouchMode,
    showDetailPanel: !state.isTouchMode,
    showMobileTopTabs: state.isTouchMode,
    mobileLayout: state.isTouchMode,
    showMobileDetailSheet:
      state.isTouchMode &&
      Boolean(state.selectedItemId) &&
      !state.suppressMobileDetailSheet,
    showMobileFileExplorer: state.isTouchMode && state.isMobileFileExplorerOpen,
    mobileDetailFillHeight: false,
    mobileDetailFields,
    contentLeftPadding: state.isTouchMode ? "0" : "sm",
  };
};

export const syncMobileResourcePageUiConfig = (deps) => {
  deps.store.setUiConfig?.({ uiConfig: deps.uiConfig });
};

export const shouldSuppressMobileDetailSheetForFileExplorerSelection = (
  deps,
) => {
  return (
    deps.store.selectIsTouchMode?.() &&
    deps.store.selectIsMobileFileExplorerOpen?.()
  );
};

export const shouldRevealSuppressedMobileDetailSheet = (deps) => {
  return (
    deps.store.selectIsTouchMode?.() &&
    deps.store.selectSuppressMobileDetailSheet?.()
  );
};

export const closeMobileResourceFileExplorerAfterSelection = (deps) => {
  const { store } = deps;

  if (
    !store.selectIsTouchMode?.() ||
    !store.selectIsMobileFileExplorerOpen?.()
  ) {
    return;
  }

  store.closeMobileFileExplorer?.();
};

export const handleMobileResourceFileExplorerOpen = (deps) => {
  const { refs, render, store } = deps;
  const selectedItemId = store.selectSelectedItemId?.();

  store.openMobileFileExplorer?.();
  render();

  if (selectedItemId) {
    requestAnimationFrame(() => {
      refs.fileExplorer?.selectItem?.({ itemId: selectedItemId });
      refs.fileexplorer?.selectItem?.({ itemId: selectedItemId });
    });
  }
};

export const handleMobileResourceFileExplorerClose = (deps) => {
  const { render, store } = deps;

  store.closeMobileFileExplorer?.();
  render();
};

export const handleMobileResourceDetailSheetClose = (deps) => {
  const { render, store } = deps;

  if (!store.selectSelectedItemId?.()) {
    return;
  }

  store.setSelectedItemId({ itemId: undefined });
  render();
};
