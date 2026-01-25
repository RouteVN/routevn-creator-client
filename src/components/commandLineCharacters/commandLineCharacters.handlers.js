import { toFlatItems } from "insieme";

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { characters, transforms } = projectService.getState();
  store.setItems({
    items: characters || { tree: [], items: {} },
  });
  store.setTransforms({
    transforms: transforms || { tree: [], items: {} },
  });

  // Use presentationState if available, otherwise fall back to character prop
  let characterItems = null;

  if (props?.presentationState?.character?.items) {
    characterItems = props.presentationState.character.items;
  } else if (props?.character?.items) {
    characterItems = props.character.items;
  }

  if (!characterItems) {
    return;
  }

  // Store raw character data from props
  store.setExistingCharacters({
    characters: characterItems,
  });

  render();
};

export const handleCharacterClick = (deps, payload) => {
  const { store, render } = deps;
  const id = payload._event.currentTarget.id;

  // Extract character index from ID (format: character-{id}-{index})
  const parts = id.split("-");
  const index = parseInt(parts[parts.length - 1]);

  // Set the character index for sprite selection
  store.setSelectedCharacterIndex({ index });

  // Go to sprite selection mode
  store.setMode({
    mode: "sprite-select",
  });

  render();
};

export const handleCharacterContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;
  const id = payload._event.currentTarget.id;

  // Extract character index from ID (format: character-{id}-{index})
  const parts = id.split("-");
  const index = parseInt(parts[parts.length - 1]);

  store.showDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    characterIndex: index,
  });

  render();
};

export const handleTransformChange = (deps, payload) => {
  const { store, render } = deps;
  const id = payload._event.currentTarget?.id || payload._event.target?.id;
  // Try both event structures (native change event and custom option-selected event)
  const value =
    payload._event.detail?.value ||
    payload._event.currentTarget?.value ||
    payload._event.target?.value;

  // Extract index from ID (format: transform-{index})
  const index = parseInt(id.replace("transform-", ""));
  store.updateCharacterTransform({ index, transform: value });
  render();
};

export const handleCharacterItemClick = (deps, payload) => {
  const { store, render } = deps;
  const characterId = payload._event.currentTarget.id.replace(
    "character-item-",
    "",
  );

  // Add character to selected characters
  store.addCharacter({ id: characterId });

  // Set the character index for sprite selection
  const currentCharacters = store.selectSelectedCharacters();
  const newCharacterIndex = currentCharacters.length - 1;
  store.setSelectedCharacterIndex({ index: newCharacterIndex });

  // Jump directly to sprite selection mode
  store.setMode({
    mode: "sprite-select",
  });

  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const selectedCharacters = store.selectSelectedCharacters();

  const characterData = {
    character: {
      items: selectedCharacters.map((char) => ({
        id: char.id,
        transformId: char.transformId,
        sprites: char.sprites || [],
        spriteName: char.spriteName || "",
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

export const handleCharacterSelectorClick = (deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "character-select",
  });

  render();
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (payload._event.detail.id === "current") {
    store.setMode({
      mode: "current",
    });
    render();
  } else if (payload._event.detail.id === "character-select") {
    store.setMode({
      mode: "sprite-select",
    });
    render();
  }
};

export const handleRemoveCharacterClick = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(
    payload._event.currentTarget.id.replace("remove-character-", ""),
  );

  store.removeCharacter(index);
  render();
};

export const handleAddCharacterClick = (deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "character-select",
  });

  render();
};

export const handleCharacterSpriteClick = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(
    payload._event.currentTarget.id.replace("character-sprite-", ""),
  );

  store.setSelectedCharacterIndex({ index });
  store.setMode({
    mode: "sprite-select",
  });

  render();
};

export const handleSpriteItemClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteId = payload._event.currentTarget.id.replace("sprite-item-", "");

  store.setTempSelectedSpriteId({
    spriteId: spriteId,
  });

  render();
};

export const handleButtonSelectClick = (deps) => {
  const { store, render, appService } = deps;
  const mode = store.selectMode();
  const selectedCharacters = store.selectCharactersWithRepositoryData();
  const selectedCharacterIndex = store.selectSelectedCharacterIndex();

  if (mode === "sprite-select") {
    const tempSelectedSpriteId = store.selectTempSelectedSpriteId();

    if (!tempSelectedSpriteId) {
      appService.showToast("A sprite is required.", { title: "Warning" });
      return;
    }

    const selectedChar = selectedCharacters[selectedCharacterIndex];

    if (selectedChar && selectedChar.sprites) {
      const tempSelectedSprite = toFlatItems(selectedChar.sprites).find(
        (sprite) => sprite.id === tempSelectedSpriteId,
      );
      if (tempSelectedSprite) {
        store.updateCharacterSprite({
          index: selectedCharacterIndex,
          spriteId: tempSelectedSpriteId,
          spriteFileId:
            tempSelectedSprite.fileId || tempSelectedSprite.resourceId,
        });
      }
    }

    store.setMode({
      mode: "current",
    });
  }

  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render } = deps;
  const { item } = payload._event.detail;
  const characterIndex = store.selectDropdownMenuCharacterIndex();

  if (item.value === "delete" && characterIndex !== null) {
    store.removeCharacter(characterIndex);
  }

  store.hideDropdownMenu();
  render();
};
