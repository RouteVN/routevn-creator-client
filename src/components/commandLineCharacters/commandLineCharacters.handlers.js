import { toFlatItems } from "../../deps/repository";
import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { repository, store, props } = deps;
  const { characters, placements, animations } = repository.getState();
  store.setItems({
    items: characters || { tree: [], items: {} },
  });
  store.setTransforms({
    transforms: placements || { tree: [], items: {} },
  });

  // Use presentationState if available, otherwise fall back to line.presentation
  let characterItems = null;

  if (props?.presentationState?.character?.items) {
    console.log(
      "[commandLineCharacters] Using presentationState for defaults:",
      props.presentationState.character,
    );
    characterItems = props.presentationState.character.items;
  } else if (props?.line?.presentation?.character?.items) {
    console.log(
      "[commandLineCharacters] Falling back to line.presentation for defaults:",
      props.line.presentation.character,
    );
    characterItems = props.line.presentation.character.items;
  }

  if (!characterItems) {
    console.log("[commandLineCharacters] No existing character data found");
    return;
  }

  // Store raw character data from props
  store.setExistingCharacters({
    characters: characterItems,
  });
};

export const handleAfterMount = async (deps) => {
  // No longer needed since we use form slot instead of context
};

export const handleFormExtra = (e, deps) => {
  // No longer needed since we use direct handlers on slot elements
};

export const handleFormChange = (e, deps) => {
  // No longer needed since we use direct select handlers
};

export const handleCharacterClick = (e, deps) => {
  const { store, render } = deps;
  const id = e.currentTarget.id;

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

export const handleCharacterContextMenu = (e, deps) => {
  e.preventDefault();
  const { store, render } = deps;
  const id = e.currentTarget.id;

  // Extract character index from ID (format: character-{id}-{index})
  const parts = id.split("-");
  const index = parseInt(parts[parts.length - 1]);

  store.showDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    characterIndex: index,
  });

  render();
};

export const handleTransformChange = (e, deps) => {
  const { store, render } = deps;
  const id = e.currentTarget?.id || e.target?.id;
  // Try both event structures (native change event and custom option-selected event)
  const value = e.detail?.value || e.currentTarget?.value || e.target?.value;

  // Extract index from ID (format: transform-{index})
  const index = parseInt(id.replace("transform-", ""));

  console.log("[handleTransformChange] Transform change event:", {
    id,
    value,
    index,
    eventType: e.type,
    detail: e.detail,
    currentTarget: e.currentTarget,
    target: e.target,
    selectedCharacters: store.selectSelectedCharacters(),
  });

  store.updateCharacterTransform({ index, transform: value });
  render();
};

export const handleCharacterItemClick = (e, deps) => {
  const { store, render } = deps;
  const characterId = e.currentTarget.id.replace("character-item-", "");

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

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent, store } = deps;
  const selectedCharacters = store.selectSelectedCharacters();

  // Only dispatch if there are characters to submit
  if (selectedCharacters.length === 0) {
    return;
  }

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

export const handleButtonSelectClick = (e, deps) => {
  const { store, render } = deps;
  const mode = store.selectMode();
  const selectedCharacters = store.selectCharactersWithRepositoryData();
  const selectedCharacterIndex = store.selectSelectedCharacterIndex();

  if (mode === "sprite-select") {
    const tempSelectedSpriteId = store.selectTempSelectedSpriteId();
    const selectedChar = selectedCharacters[selectedCharacterIndex];

    if (selectedChar && selectedChar.sprites) {
      const tempSelectedSprite = toFlatItems(selectedChar.sprites).find(
        (sprite) => sprite.id === tempSelectedSpriteId,
      );
      if (tempSelectedSprite) {
        store.updateCharacterSprite({
          index: selectedCharacterIndex,
          spriteId: tempSelectedSpriteId,
          spriteFileId: tempSelectedSprite.fileId || tempSelectedSprite.imageId,
        });
      }
    }

    store.setMode({
      mode: "current",
    });
  }

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
