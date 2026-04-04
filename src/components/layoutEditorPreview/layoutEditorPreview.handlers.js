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

export const handlePlayPreviewClick = (deps) => {
  emitPlay(deps);
};
