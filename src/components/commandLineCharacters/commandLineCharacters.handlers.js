import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { repository, store, props } = deps;
  const { characters, placements: transforms } = repository.getState();
  store.setItems({
    items: characters || { tree: [], items: {} },
  });
  store.setTransforms({
    transforms: transforms || { tree: [], items: {} },
  });

  // Initialize with existing character data if available
  if (
    props?.line?.presentation?.character?.items &&
    Array.isArray(props.line.presentation.character.items)
  ) {
    props.line.presentation.character.items.forEach((existingChar) => {
      // Find the character data from repository
      const characterData = toFlatItems(
        characters || { tree: [], items: {} },
      ).find((char) => char.id === existingChar.id);

      if (characterData) {
        // Find sprite data if available
        let spriteFileId = undefined;
        if (
          existingChar.spriteParts?.[0]?.spritePartId &&
          characterData.sprites
        ) {
          const sprite = toFlatItems(characterData.sprites).find(
            (s) => s.id === existingChar.spriteParts[0].spritePartId,
          );
          if (sprite) {
            spriteFileId = sprite.fileId;
          }
        }

        store.addCharacter({
          ...characterData,
          transform: existingChar.transformId,
          spriteId: existingChar.spriteParts?.[0]?.spritePartId,
          spriteFileId: spriteFileId,
        });
      }
    });
  }
};

export const handleCharacterItemClick = (e, deps) => {
  const { store, render, repository } = deps;
  const characterId = e.currentTarget.id.replace("character-item-", "");

  // Find the character data from the repository
  const { characters } = repository.getState();
  const tempSelectedCharacter = toFlatItems(
    characters || { tree: [], items: {} },
  ).find((char) => char.id === characterId);

  if (tempSelectedCharacter) {
    // Add character to selected characters
    store.addCharacter(tempSelectedCharacter);

    // Set the character index for sprite selection
    const currentCharacters = store.getState().selectedCharacters;
    const newCharacterIndex = currentCharacters.length - 1;
    store.setSelectedCharacterIndex({ index: newCharacterIndex });

    // Jump directly to sprite selection mode
    store.setMode({
      mode: "sprite-select",
    });
  }

  render();
};

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent, store } = deps;
  const selectedCharacters = store.getState().selectedCharacters;

  // Only dispatch if there are characters to submit
  if (selectedCharacters.length === 0) {
    console.warn("No characters selected to submit");
    return;
  }

  const characterData = {
    character: {
      items: selectedCharacters.map((char) => ({
        id: char.id,
        transformId: char.transform,
        spriteParts: [
          {
            id: "base",
            spritePartId: char.spriteId,
          },
        ],
      })),
    },
  };
  dispatchEvent(
    new CustomEvent("submit", {
      detail: characterData,
      bubbles: true,
      composed: true,
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

export const handleBreadcumbClick = (e, deps) => {
  const { dispatchEvent, store, render } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (e.detail.id === "current") {
    store.setMode({
      mode: "current",
    });
    render();
  } else if (e.detail.id === "character-select") {
    store.setMode({
      mode: "sprite-select",
    });
    render();
  }
};

export const handleRemoveCharacterClick = (e, deps) => {
  const { store, render } = deps;
  const index = parseInt(e.currentTarget.id.replace("remove-character-", ""));

  store.removeCharacter(index);
  render();
};

export const handleTransformChange = (e, deps) => {
  const { store, render } = deps;
  const index = parseInt(e.currentTarget.id.replace("transform-select-", ""));
  const transform = e.detail.value;

  store.updateCharacterTransform({ index, transform });
  render();
};

export const handleAddCharacterClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "character-select",
  });

  render();
};

export const handleCharacterSpriteClick = (e, deps) => {
  const { store, render } = deps;
  const index = parseInt(e.currentTarget.id.replace("character-sprite-", ""));

  store.setSelectedCharacterIndex({ index });
  store.setMode({
    mode: "sprite-select",
  });

  render();
};

export const handleSpriteItemClick = (e, deps) => {
  const { store, render } = deps;
  const spriteId = e.currentTarget.id.replace("sprite-item-", "");

  store.setTempSelectedSpriteId({
    spriteId: spriteId,
  });

  render();
};

export const handleButtonSelectClick = (payload, deps) => {
  const { store, render, repository } = deps;
  const state = store.getState();

  if (state.mode === "sprite-select") {
    const tempSelectedSpriteId = store.selectTempSelectedSpriteId();
    const selectedCharIndex = state.selectedCharacterIndex;
    const selectedChar = state.selectedCharacters[selectedCharIndex];

    if (selectedChar && selectedChar.sprites) {
      const tempSelectedSprite = toFlatItems(selectedChar.sprites).find(
        (sprite) => sprite.id === tempSelectedSpriteId,
      );
      if (tempSelectedSprite) {
        store.updateCharacterSprite({
          index: selectedCharIndex,
          spriteId: tempSelectedSpriteId,
          spriteFileId: tempSelectedSprite.fileId,
        });
      }
    }

    store.setMode({
      mode: "current",
    });
  }

  render();
};

export const handleResetClick = (payload, deps) => {
  const { store, render } = deps;

  store.clearCharacters();
  render();
};
