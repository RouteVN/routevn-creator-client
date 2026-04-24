export const isTouchUiConfig = (uiConfig) =>
  uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";

export const createMobileResourcePageState = () => ({
  isTouchMode: false,
  isMobileFileExplorerOpen: false,
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
    showMobileDetailSheet: state.isTouchMode && Boolean(state.selectedItemId),
    showMobileFileExplorer: state.isTouchMode && state.isMobileFileExplorerOpen,
    mobileDetailFillHeight: false,
    mobileDetailFields,
    contentLeftPadding: state.isTouchMode ? "0" : "sm",
  };
};

export const syncMobileResourcePageUiConfig = (deps) => {
  deps.store.setUiConfig?.({ uiConfig: deps.uiConfig });
};

export const closeMobileResourceFileExplorerAfterSelection = (deps) => {
  const { store } = deps;
  const state = store.getState();

  if (!state.isTouchMode || !state.isMobileFileExplorerOpen) {
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
