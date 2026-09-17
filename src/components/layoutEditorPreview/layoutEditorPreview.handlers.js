import { subscribeCharacterAvatarOptions } from "../../internal/ui/characterAvatarOptions.js";

const toPositivePreviewRevealingSpeed = (rawValue) => {
  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : 50;
};

const DIALOGUE_CHARACTER_ID_FIELD = "dialogue-character-id";
const DIALOGUE_CUSTOM_CHARACTER_NAME_FIELD = "dialogue-custom-character-name";
const DIALOGUE_CHARACTER_NAME_FIELD = "dialogue-character-name";

const getPreviewCharactersData = (deps) => {
  const repositoryState = deps.store.selectRepositoryState();
  return deps.props.charactersData ?? repositoryState?.characters;
};

const getSelectedCharacterName = (deps, characterId) => {
  if (typeof characterId !== "string" || characterId.length === 0) {
    return "";
  }

  return getPreviewCharactersData(deps)?.items?.[characterId]?.name ?? "";
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
    oldProps.layoutState?.layoutType !== newProps.layoutState?.layoutType ||
    oldProps.layoutState?.layoutSchemaVersion !==
      newProps.layoutState?.layoutSchemaVersion
  );
};

const didLayoutElementsChange = (oldProps = {}, newProps = {}) => {
  return oldProps.layoutState?.elements !== newProps.layoutState?.elements;
};

const didInitialPreviewDataChange = (oldProps = {}, newProps = {}) => {
  return (
    JSON.stringify(oldProps.initialPreviewData ?? {}) !==
    JSON.stringify(newProps.initialPreviewData ?? {})
  );
};

export const handleBeforeMount = (deps) => {
  const { store, props, uiConfig, render } = deps;
  store.setUiConfig({ uiConfig });
  store.setLayoutState({ layoutState: props.layoutState });
  store.hydratePreviewState({ previewData: props.initialPreviewData });
  return subscribeCharacterAvatarOptions(deps, {
    onProjectStateChanged: (repositoryState) => {
      store.setRepositoryState({ repositoryState });
      render();
    },
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
  const initialPreviewDataChanged = didInitialPreviewDataChange(
    oldProps,
    newProps,
  );

  if (
    !layoutIdentityChanged &&
    !layoutElementsChanged &&
    !initialPreviewDataChanged
  ) {
    return;
  }

  deps.store.setLayoutState({
    layoutState: newProps.layoutState,
  });

  if (layoutIdentityChanged || initialPreviewDataChanged) {
    deps.store.hydratePreviewState({
      previewData: newProps.initialPreviewData,
    });
  }

  if (layoutIdentityChanged || layoutElementsChanged) {
    await syncRepositoryState(deps);
  }

  renderAndEmitPreviewDataChange(deps);
};

export const handleDialogueFormChange = (deps, payload) => {
  const { name, value: fieldValue } = payload._event.detail;

  if (name === DIALOGUE_CHARACTER_ID_FIELD) {
    deps.store.setDialogueDefaultValue({
      name,
      fieldValue,
    });

    const dialogueDefaultValues =
      deps.store.selectDialogueDefaultValues() ?? {};
    if (dialogueDefaultValues[DIALOGUE_CUSTOM_CHARACTER_NAME_FIELD] !== true) {
      deps.store.setDialogueDefaultValue({
        name: DIALOGUE_CHARACTER_NAME_FIELD,
        fieldValue: getSelectedCharacterName(deps, fieldValue),
      });
    }

    renderAndEmitPreviewDataChange(deps);
    return;
  }

  if (name === DIALOGUE_CUSTOM_CHARACTER_NAME_FIELD) {
    deps.store.setDialogueDefaultValue({
      name,
      fieldValue,
    });

    if (fieldValue !== true) {
      const dialogueDefaultValues =
        deps.store.selectDialogueDefaultValues() ?? {};
      deps.store.setDialogueDefaultValue({
        name: DIALOGUE_CHARACTER_NAME_FIELD,
        fieldValue: getSelectedCharacterName(
          deps,
          dialogueDefaultValues[DIALOGUE_CHARACTER_ID_FIELD] ?? "",
        ),
      });
    }

    renderAndEmitPreviewDataChange(deps);
    return;
  }

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

export const handleInputFieldsFormChange = (deps, payload) => {
  const { name, value: fieldValue } = payload._event.detail;

  deps.store.setPreviewInputFieldValue({ name, fieldValue });
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

export const handleCharacterAvatarClick = (deps) => {
  const { store, projectService, render } = deps;
  store.setRepositoryState({
    repositoryState: projectService.getRepositoryState(),
  });
  store.openImageSelectorDialog({ resourceTarget: "characterSprites" });
  render();
};

export const handleCharacterAvatarKeyDown = (deps, { _event }) => {
  if (_event.key === "Enter" || _event.key === " ") {
    _event.preventDefault();
    handleCharacterAvatarClick(deps);
  }
};

export const handleCharacterAvatarContextMenu = (deps, { _event }) => {
  const { store, render, i18n } = deps;
  if (!store.selectDialogueDefaultValues()["dialogue-character-sprite-id"]) {
    return;
  }

  _event.preventDefault();
  store.showDropdownMenu({
    x: _event.clientX,
    y: _event.clientY,
    items: [
      {
        type: "item",
        label: i18n.resourcePages.removeMenuItem,
        value: "remove-character-avatar",
      },
    ],
  });
  render();
};

export const handleClearCharacterAvatar = (deps) => {
  const { store } = deps;
  store.setDialogueDefaultValue({
    name: "dialogue-character-sprite-id",
    fieldValue: undefined,
  });
  renderAndEmitPreviewDataChange(deps);
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
  const { store, render } = deps;
  const { imageId } = payload._event.detail;
  store.setImageSelectorSelection({ imageId });
  render();
};

export const handleImageSelectorBackClick = (deps) => {
  const { store, render } = deps;
  store.showImageSelectorCharacters();
  render();
};

export const handleImageSelectorCancel = (deps) => {
  deps.store.closeImageSelectorDialog();
  deps.render();
};

export const handleImageSelectorSubmit = (deps) => {
  const { store, refs } = deps;
  const transformField = "dialogue-character-sprite-transform-id";
  const previousTransformId =
    store.selectDialogueDefaultValues()[transformField];
  store.applyImageSelectorSelection();
  store.hideDropdownMenu();
  renderAndEmitPreviewDataChange(deps);
  const transformId = store.selectDialogueDefaultValues()[transformField];
  if (transformId !== previousTransformId) {
    refs.dialogueForm.setValues({ values: { [transformField]: transformId } });
  }
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
  const { store, render } = deps;
  const item = payload._event.detail?.item || payload._event.detail;

  store.hideDropdownMenu();

  if (item?.value === "remove-character-avatar") {
    handleClearCharacterAvatar(deps);
    return;
  }

  if (item?.value === "remove-background") {
    handleClearPreviewBackground(deps);
    return;
  }

  render();
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
