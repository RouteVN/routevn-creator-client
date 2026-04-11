const toPositivePreviewRevealingSpeed = (rawValue) => {
  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : 50;
};

const syncRepositoryState = async (deps) => {
  await deps.projectService.ensureRepository();
  deps.store.setRepositoryState({
    repositoryState: deps.projectService.getRepositoryState(),
  });
};

const emitPreviewDataChange = (deps) => {
  deps.dispatchEvent(
    new CustomEvent("preview-data-change", {
      bubbles: true,
      composed: true,
      detail: {
        previewData: deps.store.selectPreviewData(),
      },
    }),
  );
};

const emitPlay = (deps) => {
  deps.dispatchEvent(
    new CustomEvent("play", {
      bubbles: true,
      composed: true,
    }),
  );
};

const renderAndEmitPreviewDataChange = (deps) => {
  deps.render();
  emitPreviewDataChange(deps);
};

const didLayoutIdentityChange = (oldProps = {}, newProps = {}) => {
  return (
    oldProps.layoutState?.id !== newProps.layoutState?.id ||
    oldProps.layoutState?.layoutType !== newProps.layoutState?.layoutType
  );
};

const didLayoutElementsChange = (oldProps = {}, newProps = {}) => {
  return oldProps.layoutState?.elements !== newProps.layoutState?.elements;
};

export const handleBeforeMount = (deps) => {
  deps.store.setLayoutState({
    layoutState: deps.props.layoutState,
  });
};

export const handleAfterMount = async (deps) => {
  await syncRepositoryState(deps);
  renderAndEmitPreviewDataChange(deps);
};

export const handleOnUpdate = async (deps, payload) => {
  const { oldProps = {}, newProps = {} } = payload;
  const layoutIdentityChanged = didLayoutIdentityChange(oldProps, newProps);
  const layoutElementsChanged = didLayoutElementsChange(oldProps, newProps);

  if (!layoutIdentityChanged && !layoutElementsChanged) {
    return;
  }

  if (layoutIdentityChanged) {
    deps.store.resetPreviewState();
  }

  deps.store.setLayoutState({
    layoutState: newProps.layoutState,
  });
  await syncRepositoryState(deps);
  renderAndEmitPreviewDataChange(deps);
};

export const handleDialogueFormChange = (deps, payload) => {
  const { name, value: fieldValue } = payload._event.detail;

  deps.store.setDialogueDefaultValue({ name, fieldValue });
  renderAndEmitPreviewDataChange(deps);
};

export const handleNvlFormChange = (deps, payload) => {
  const { name, value: fieldValue } = payload._event.detail;

  deps.store.setNvlDefaultValue({ name, fieldValue });
  renderAndEmitPreviewDataChange(deps);
};

export const handleChoiceFormChange = (deps, payload) => {
  const { name, value: fieldValue } = payload._event.detail;

  deps.store.setChoiceDefaultValue({ name, fieldValue });
  renderAndEmitPreviewDataChange(deps);
};

export const handleHistoryFormChange = (deps, payload) => {
  const { name, value: fieldValue } = payload._event.detail;

  deps.store.setHistoryDefaultValue({ name, fieldValue });
  renderAndEmitPreviewDataChange(deps);
};

export const handleSaveLoadFormChange = (deps, payload) => {
  const { name, value: fieldValue } = payload._event.detail;

  deps.store.setSaveLoadDefaultValue({ name, fieldValue });
  renderAndEmitPreviewDataChange(deps);
};

export const handlePreviewVariablesFormChange = (deps, payload) => {
  const { name, value: fieldValue } = payload._event.detail;

  deps.store.setPreviewVariableValue({ name, fieldValue });
  renderAndEmitPreviewDataChange(deps);
};

export const handlePreviewRevealingSpeedInput = (deps, payload) => {
  const rawValue =
    payload._event.detail?.value ??
    payload._event.currentTarget?.value ??
    payload._event.target?.value;

  deps.store.setPreviewRevealingSpeed({
    value: toPositivePreviewRevealingSpeed(rawValue),
  });
  renderAndEmitPreviewDataChange(deps);
};

export const handlePreviewBackgroundFieldClick = async (deps) => {
  await syncRepositoryState(deps);
  deps.store.hideDropdownMenu();
  deps.store.openImageSelectorDialog();
  deps.render();
};

export const handlePreviewBackgroundFieldContextMenu = (deps, payload) => {
  const imageId = deps.store.selectPreviewData()?.backgroundImageId;
  if (!imageId) {
    return;
  }

  const event = payload._event;
  event.preventDefault();
  deps.store.showDropdownMenu({
    x: event.clientX,
    y: event.clientY,
  });
  deps.render();
};

export const handleImageSelected = (deps, payload) => {
  deps.store.setImageSelectorSelectedImageId({
    imageId: payload._event.detail?.imageId,
  });
  deps.render();
};

export const handleImageSelectorCancel = (deps) => {
  deps.store.closeImageSelectorDialog();
  deps.render();
};

export const handleImageSelectorSubmit = (deps) => {
  const state = deps.store.getState
    ? deps.store.getState()
    : deps.store._state || deps.store.state;
  const imageSelectorDialog = state?.imageSelectorDialog;

  deps.store.setPreviewBackgroundImageId({
    imageId: imageSelectorDialog?.selectedImageId,
  });
  deps.store.closeImageSelectorDialog();
  deps.store.hideDropdownMenu();
  renderAndEmitPreviewDataChange(deps);
};

export const handleImageDoubleClick = (deps, payload) => {
  const imageId = payload?._event?.detail?.imageId;
  if (!imageId) {
    return;
  }

  deps.store.showFullImagePreview({ imageId });
  deps.render();
};

export const handleFileExplorerClickItem = (deps, payload) => {
  const itemId = payload?._event?.detail?.itemId;
  if (!itemId) {
    return;
  }

  deps.refs.imageSelector?.transformedHandlers?.handleScrollToItem?.({
    itemId,
  });
};

export const handleClearPreviewBackground = (deps) => {
  deps.store.setPreviewBackgroundImageId({
    imageId: undefined,
  });
  deps.store.hideDropdownMenu();
  renderAndEmitPreviewDataChange(deps);
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const item = payload._event.detail?.item || payload._event.detail;

  deps.store.hideDropdownMenu();

  if (item?.value === "remove-background") {
    handleClearPreviewBackground(deps);
    return;
  }

  deps.render();
};

export const handleDropdownMenuClose = (deps) => {
  deps.store.hideDropdownMenu();
  deps.render();
};

export const handlePreviewOverlayClick = (deps) => {
  deps.store.hideFullImagePreview();
  deps.render();
};

export const handlePlayPreviewClick = (deps) => {
  emitPlay(deps);
};
