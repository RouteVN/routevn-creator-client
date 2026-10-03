import { isTouchLandscape } from "../../touchLayout.js";

export const isTouchUiConfig = (uiConfig) =>
  uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";

export const TABLET_LANDSCAPE_EXPLORER_WIDTH = 300;

// The app's touch landscape layout: touch windows at least 768 logical
// pixels wide and wider than tall.
const isTabletLandscapeState = (state) =>
  isTouchLandscape({
    isTouchMode: state.isTouchMode,
    width: state.appWindowMetrics.width,
    height: state.appWindowMetrics.height,
  });

export const MOBILE_RESOURCE_SCROLL_BOTTOM_PADDING =
  "calc(96px + env(safe-area-inset-bottom))";

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

// Matches the Projects page content column.
export const TABLET_LANDSCAPE_CONTENT_WIDTH = 640;

// Centers a content column on tablet landscape with horizontal padding, so the
// scroll container and its scrollbar keep spanning the full window.
export const buildTabletLandscapeContentColumnStyle = (
  state,
  { minGutter = "0px" } = {},
) => {
  if (!isTabletLandscapeState(state)) {
    return "";
  }

  const gutter = `max(${minGutter}, calc((100% - ${TABLET_LANDSCAPE_CONTENT_WIDTH}px) / 2))`;
  return `padding-left: ${gutter}; padding-right: ${gutter};`;
};

export const createMobileResourcePageState = () => ({
  isTouchMode: false,
  appWindowMetrics: { width: 0, height: 0 },
  isMobileFileExplorerOpen: false,
  suppressMobileDetailSheet: false,
});

export const setMobileResourcePageWindowMetricsState = (
  state,
  { width, height } = {},
) => {
  state.appWindowMetrics.width = width;
  state.appWindowMetrics.height = height;
};

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

export const selectIsTabletLandscapeState = ({ state }) =>
  isTabletLandscapeState(state);

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
  const showTabletLandscapeExplorer = isTabletLandscapeState(state);

  return {
    isTouchMode: state.isTouchMode,
    showExplorerPanel: !state.isTouchMode,
    showDetailPanel: !state.isTouchMode,
    showMobileTopTabs: state.isTouchMode,
    mobileLayout: state.isTouchMode,
    showTabletLandscapeExplorer,
    tabletLandscapeExplorerWidth: TABLET_LANDSCAPE_EXPLORER_WIDTH,
    showMobileMenuButton: state.isTouchMode && !showTabletLandscapeExplorer,
    showMobileDetailSheet:
      state.isTouchMode &&
      Boolean(state.selectedItemId) &&
      !state.suppressMobileDetailSheet,
    showMobileFileExplorer:
      state.isTouchMode &&
      !showTabletLandscapeExplorer &&
      state.isMobileFileExplorerOpen,
    mobileDetailFillHeight: false,
    mobileDetailFields,
    contentLeftPadding: state.isTouchMode ? "0" : "sm",
  };
};

export const syncMobileResourcePageUiConfig = (deps) => {
  deps.store.setUiConfig?.({ uiConfig: deps.uiConfig });
};

export const mountMobileResourceWindowLayout = ({
  windowMetricsClient,
  store,
  render,
}) =>
  windowMetricsClient?.subscribe((metrics) => {
    store.setAppWindowMetrics(metrics);
    render();
  });

export const shouldSuppressMobileDetailSheetForFileExplorerSelection = (
  deps,
) => {
  // Tablet landscape implies touch, so pages that do not expose
  // selectIsTouchMode still suppress the sheet beside the persistent explorer.
  return (
    deps.store.selectIsTabletLandscape?.() ||
    (deps.store.selectIsTouchMode?.() &&
      deps.store.selectIsMobileFileExplorerOpen?.())
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
