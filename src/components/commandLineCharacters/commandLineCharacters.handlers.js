import { toFlatItems } from "../../deps/repository";

export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { characters, placements } = repository.getState();
  store.setItems({
    items: characters || { tree: [], items: {} }
  });
  store.setPlacements({
    placements: placements || { tree: [], items: {} }
  });
};

export const handleCharacterItemClick = (e, deps) => {
  const { store, render, repository } = deps;
  const characterId = e.currentTarget.id.replace('character-item-', '');

  // Find the character data from the repository
  const { characters } = repository.getState();
  const tempSelectedCharacter = toFlatItems(characters || { tree: [], items: {} }).find(char => char.id === characterId);

  if (tempSelectedCharacter) {
    // Add character to selected characters
    store.addCharacter(tempSelectedCharacter);

    // Set the character index for sprite selection
    const currentCharacters = store.getState().selectedCharacters;
    const newCharacterIndex = currentCharacters.length - 1;
    store.setSelectedCharacterIndex({ index: newCharacterIndex });

    // Jump directly to sprite selection mode
    store.setMode({
      mode: 'sprite-select'
    });
  }

  render();
};

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent, store } = deps;
  const selectedCharacters = store.getState().selectedCharacters;

  // Only dispatch if there are characters to submit
  if (selectedCharacters.length === 0) {
    console.warn('No characters selected to submit');
    return;
  }

  const characterData = {
    character: {
      items: selectedCharacters.map(char => ({
        id: char.id,
        placementId: char.placement,
        spriteParts: [
          {
            id: "base",
            spritePartId: char.spriteId
          }
        ]
      }))
    }
  };
  
  console.log('Submitting character data:', characterData);
  
  dispatchEvent(
    new CustomEvent("submit", {
      detail: characterData,
      bubbles: true,
      composed: true
    }),
  );
};

export const handleCharacterSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "character-select",
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
    mode: "character-select",
  });

  render();
};

export const handleBreadcumbCharacterSelectClick = (payload, deps) => {
  const { store, render } = deps;
  store.setMode({
    mode: "sprite-select",
  });
  render();
};

export const handleCharacterSpriteClick = (e, deps) => {
  const { store, render } = deps;
  const index = parseInt(e.currentTarget.id.replace('character-sprite-', ''));

  store.setSelectedCharacterIndex({ index });
  store.setMode({
    mode: "sprite-select",
  });

  render();
};

export const handleSpriteItemClick = (e, deps) => {
  const { store, render } = deps;
  const spriteId = e.currentTarget.id.replace('sprite-item-', '');

  store.setTempSelectedSpriteId({
    spriteId: spriteId,
  });

  render();
};

export const handleButtonSelectClick = (payload, deps) => {
  const { store, render, repository } = deps;
  const state = store.getState();

  if (state.mode === 'sprite-select') {
    const tempSelectedSpriteId = store.selectTempSelectedSpriteId();
    const selectedCharIndex = state.selectedCharacterIndex;
    const selectedChar = state.selectedCharacters[selectedCharIndex];

    if (selectedChar && selectedChar.sprites) {
      const tempSelectedSprite = toFlatItems(selectedChar.sprites).find(sprite => sprite.id === tempSelectedSpriteId);
      if (tempSelectedSprite) {
        store.updateCharacterSprite({
          index: selectedCharIndex,
          spriteId: tempSelectedSpriteId,
          spriteFileId: tempSelectedSprite.fileId
        });
      }
    }

    store.setMode({
      mode: 'current'
    });
  }

  render();
};
