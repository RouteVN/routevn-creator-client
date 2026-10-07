const dispatchSelectionChange = (deps) => {
  const { dispatchEvent, store } = deps;
  dispatchEvent(
    new CustomEvent("selection-change", {
      detail: { selection: store.selectSelection() },
    }),
  );
};

export const handleBeforeMount = (deps) => {
  const { store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
};

export const handleAfterMount = (deps) => {
  const { projectService, props, render, store } = deps;
  store.loadSelection({
    charactersData: projectService.getRepositoryState().characters,
    characterId: props.characterId,
    sprites: props.sprites,
  });
  render();
};

// A card picks the character, or the sprite for the selected group.
export const handleItemClick = (deps, payload) => {
  const { render, store } = deps;
  const { itemId } = payload._event.currentTarget.dataset;
  if (store.selectStep() === "characters") {
    store.pickCharacter({ characterId: itemId });
  } else {
    store.pickSprite({ spriteId: itemId });
  }
  render();
  dispatchSelectionChange(deps);
};

export const handleBackClick = (deps) => {
  const { render, store } = deps;
  store.showCharacters();
  render();
};

export const handleGroupTabClick = (deps, payload) => {
  const { render, store } = deps;
  const { id } = payload._event.detail;
  store.setSelectedGroupId({ groupId: id });
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { render, store } = deps;
  store.setSearchQuery({ value: payload._event.detail.value ?? "" });
  render();
};

// A folder in the side list scrolls the cards to it.
export const handleFileExplorerItemClick = (deps, payload) => {
  const { refs } = deps;
  const { itemId } = payload._event.detail;
  refs.galleryScroll
    .querySelector(`[data-group-id="${itemId}"]`)
    ?.scrollIntoView({ block: "start" });
};
