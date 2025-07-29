import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { repository, store, props } = deps;
  const { characters, placements, animations } = repository.getState();
  store.setItems({
    items: characters || { tree: [], items: {} },
  });
  store.setTransforms({
    transforms: placements || { tree: [], items: {} },
  });
  store.setAnimations({
    animations: animations || { tree: [], items: {} },
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
          // Initialize new properties from existing data if available
          spriteName: existingChar.spriteName || "",
          animation: existingChar.animation || "none",
        });
      }
    });
  }
};

export const handleAfterMount = async (deps) => {
  const { repository, store, render, props, httpClient } = deps;

  // Load sprite image URLs for existing characters if available
  if (
    props?.line?.presentation?.character?.items &&
    Array.isArray(props.line.presentation.character.items)
  ) {
    const selectedCharacters = store.getState().selectedCharacters;
    const formFieldResources = {};

    // Load sprite URLs for each existing character
    for (let i = 0; i < selectedCharacters.length; i++) {
      const character = selectedCharacters[i];

      if (character.spriteFileId && httpClient) {
        try {
          const { url } = await httpClient.creator.getFileContent({
            fileId: character.spriteFileId,
            projectId: "someprojectId",
          });
          formFieldResources[`char[${i}]`] = { src: url };
        } catch (error) {
          // Failed to load sprite URL
        }
      }
    }

    // Update form field resources if we have any URLs
    if (Object.keys(formFieldResources).length > 0) {
      store.setFormFieldResources(formFieldResources);
      render();
    }
  }
};

export const handleOnUpdate = () => {};

export const handleFormExtra = async (e, deps) => {
  const { store, render } = deps;
  const { name, trigger } = e.detail;

  // Extract index from field name (e.g., "char[0]" -> 0)
  const match = name.match(/char\[(\d+)\]/);
  if (match) {
    const index = parseInt(match[1]);

    if (trigger === "contextmenu") {
      // Show context menu for right-click
      store.showDropdownMenu({
        position: { x: e.detail.x, y: e.detail.y },
        characterIndex: index,
      });
      render();
    } else {
      // Regular click - go to sprite selection
      store.setSelectedCharacterIndex({ index });
      store.setMode({ mode: "sprite-select" });
      render();
    }
  }
};

export const handleFormChange = (e, deps) => {
  const { store, render } = deps;
  const { name, fieldValue } = e.detail;

  // Handle transform field changes
  const transformMatch = name.match(/char\[(\d+)\]\.transform/);
  if (transformMatch) {
    const index = parseInt(transformMatch[1]);
    store.updateCharacterTransform({ index, transform: fieldValue });
    render();
  }

  // Handle animation field changes
  const animationMatch = name.match(/char\[(\d+)\]\.animation/);
  if (animationMatch) {
    const index = parseInt(animationMatch[1]);
    store.updateCharacterAnimation({ index, animation: fieldValue });
    render();
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
        // Include new properties in the output
        spriteName: char.spriteName || "",
        animation: char.animation || "none",
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

export const handleButtonSelectClick = async (payload, deps) => {
  const { store, render, repository, downloadImageData, httpClient } = deps;
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
          spriteFileId: tempSelectedSprite.fileId || tempSelectedSprite.imageId,
        });

        // Get URL for the sprite and update form field resources
        if (tempSelectedSprite.fileId && httpClient) {
          try {
            const { url } = await httpClient.creator.getFileContent({
              fileId: tempSelectedSprite.fileId,
              projectId: "someprojectId",
            });

            const currentResources = store.getState().formFieldResources || {};
            const newFormFieldResources = {
              ...currentResources,
              [`char[${selectedCharIndex}]`]: { src: url },
            };

            store.setFormFieldResources(newFormFieldResources);
          } catch (error) {
            // Failed to load sprite URL
          }
        }
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

export const handleDropdownMenuClose = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render } = deps;
  const { item } = e.detail;
  const characterIndex = store.selectDropdownMenuCharacterIndex();

  if (item.value === "delete" && characterIndex !== null) {
    store.removeCharacter(characterIndex);
  }

  store.hideDropdownMenu();
  render();
};
