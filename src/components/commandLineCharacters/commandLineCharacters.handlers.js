export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { characters } = repository.getState();
  store.setItems({
    items: characters
  });
};

export const handleCharacterItemClick = (e, deps) => {
  const { store, render, props } = deps;
  const characterId = e.currentTarget.id.replace('character-item-', '');
  
  // Find the character data from the repository
  const { characters } = deps.repository.getState();
  const flatCharacters = characters ? Object.values(characters.items || {}) : [];
  const selectedCharacter = flatCharacters.find(char => char.id === characterId);
  
  if (selectedCharacter) {
    store.addCharacter(selectedCharacter);
  }
  
  store.setMode({
    mode: 'current'
  });

  render();
};

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent, store } = deps;
  const selectedCharacters = store.getState().selectedCharacters;
  
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        characters: selectedCharacters.map(char => ({
          characterId: char.id,
          placement: char.placement
        }))
      },
    }),
  );
};

export const handleCharacterSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};

export const handleBreadcumbCharactersClick = (payload, deps) => {
  const { store, render } = deps;
  store.setMode({
    mode: "current",
  });
  render();
};

export const handleRemoveCharacterClick = (e, deps) => {
  const { store, render } = deps;
  const index = parseInt(e.currentTarget.id.replace('remove-character-', ''));
  
  store.removeCharacter(index);
  render();
};

export const handlePlacementChange = (e, deps) => {
  const { store, render } = deps;
  const index = parseInt(e.currentTarget.id.replace('placement-select-', ''));
  const placement = e.currentTarget.value;
  
  store.updateCharacterPlacement({ index, placement });
  render();
};

export const handleAddCharacterClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "gallery",
  });

  render();
};