import { toFlatItems } from "../../internal/project/tree.js";

const getCharacterIndexFromEvent = (event) => {
  const index = Number.parseInt(event?.currentTarget?.dataset?.index, 10);
  return Number.isInteger(index) ? index : undefined;
};

const getSelectedSpriteId = (character = {}) => {
  return character?.sprites?.[0]?.resourceId;
};

const beginExistingCharacterSpriteSelection = (store, index) => {
  const selectedCharacters = store.selectSelectedCharacters();
  const selectedCharacter = selectedCharacters[index];

  store.clearPendingCharacterIndex();
  store.setSelectedCharacterIndex({ index });
  store.setTempSelectedSpriteId({
    spriteId: getSelectedSpriteId(selectedCharacter),
  });
  store.setSearchQuery({ value: "" });
  store.setMode({
    mode: "sprite-select",
  });
};

const beginNewCharacterSpriteSelection = (store, characterId) => {
  store.addCharacter({ id: characterId });

  const currentCharacters = store.selectSelectedCharacters();
  const newCharacterIndex = currentCharacters.length - 1;

  store.setPendingCharacterIndex({ index: newCharacterIndex });
  store.setSelectedCharacterIndex({ index: newCharacterIndex });
  store.setTempSelectedSpriteId({ spriteId: undefined });
  store.setSearchQuery({ value: "" });
  store.setMode({
    mode: "sprite-select",
  });
};

const discardPendingCharacterSelection = (store) => {
  const pendingCharacterIndex = store.selectPendingCharacterIndex();

  if (!Number.isInteger(pendingCharacterIndex)) {
    return;
  }

  store.removeCharacter({ index: pendingCharacterIndex });
  store.clearPendingCharacterIndex();
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, props, render } = deps;
  await projectService.ensureRepository();
  const { animations, characters, transforms } = projectService.getState();
  store.setItems({
    items: characters || { tree: [], items: {} },
  });
  store.setTransforms({
    transforms: transforms || { tree: [], items: {} },
  });
  store.setAnimations({
    animations: animations || { tree: [], items: {} },
  });

  // Use presentationState if available, otherwise fall back to character prop
  let characterItems = null;

  if (props?.presentationState?.character?.items) {
    characterItems = props.presentationState.character.items;
  } else if (props?.character?.items) {
    characterItems = props.character.items;
  }

  if (characterItems) {
    // Store raw character data from props
    store.setExistingCharacters({
      characters: characterItems,
    });
  }

  render();
};

export const handleCharacterClick = (deps, payload) => {
  const { store, render } = deps;
  const index = getCharacterIndexFromEvent(payload._event);

  if (index === undefined) {
    return;
  }

  beginExistingCharacterSpriteSelection(store, index);
  render();
};

export const handleCharacterContextMenu = (deps, payload) => {
  payload._event.preventDefault();
  const { store, render } = deps;
  const index = getCharacterIndexFromEvent(payload._event);

  if (index === undefined) {
    return;
  }

  store.showDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    characterIndex: index,
  });

  render();
};

export const handleTransformChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateCharacterTransform({ index, transform: value });
  render();
};

export const handleAnimationModeChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateCharacterAnimationMode({ index, animationMode: value });
  render();
};

export const handleAnimationChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateCharacterAnimation({ index, animationId: value });
  render();
};

export const handleFileExplorerItemClick = (deps, payload) => {
  const { refs, store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  const mode = store.selectMode();

  if (isFolder) {
    const groupElement = refs.galleryScroll?.querySelector(
      `[data-group-id="${itemId}"]`,
    );
    groupElement?.scrollIntoView?.({ block: "start" });
    return;
  }

  if (mode === "sprite-select") {
    store.setTempSelectedSpriteId({ spriteId: itemId });
    render();
    return;
  }

  beginNewCharacterSpriteSelection(store, itemId);
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  store.setSearchQuery({ value: payload._event.detail.value ?? "" });
  render();
};

export const handleFormExtra = () => {
  // Keep for compatibility with rtgl-form form-field-event wiring.
};

export const handleFormChange = () => {
  // Transform and animation updates are handled by direct value-change listeners.
};

export const handleCharacterItemClick = (deps, payload) => {
  const { store, render } = deps;
  const target = payload._event.currentTarget;
  const characterId =
    target?.dataset?.characterId ||
    target?.id?.replace("characterItem", "") ||
    "";

  beginNewCharacterSpriteSelection(store, characterId);
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const selectedCharacters = store.selectSelectedCharacters();

  const characterData = {
    character: {
      items: selectedCharacters.map((char) => {
        const item = {
          id: char.id,
          transformId: char.transformId,
          sprites: char.sprites || [],
          spriteName: char.spriteName || "",
        };

        if (char.animations?.resourceId) {
          item.animations = {
            resourceId: char.animations.resourceId,
          };
        }

        return item;
      }),
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

  store.setSearchQuery({ value: "" });
  store.setMode({
    mode: "character-select",
  });

  render();
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  const mode = store.selectMode();

  if (mode === "sprite-select") {
    discardPendingCharacterSelection(store);
    store.setSelectedCharacterIndex({ index: undefined });
    store.setTempSelectedSpriteId({ spriteId: undefined });
  }

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
    store.setSearchQuery({ value: "" });
    store.setMode({
      mode: "character-select",
    });
    render();
  }
};

export const handleRemoveCharacterClick = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(
    payload._event.currentTarget.id.replace("removeCharacter", ""),
  );

  store.removeCharacter({ index: index });
  render();
};

export const handleAddCharacterClick = (deps) => {
  const { store, render } = deps;

  store.clearPendingCharacterIndex();
  store.setSelectedCharacterIndex({ index: undefined });
  store.setTempSelectedSpriteId({ spriteId: undefined });
  store.setSearchQuery({ value: "" });
  store.setMode({
    mode: "character-select",
  });

  render();
};

export const handleSpriteItemClick = (deps, payload) => {
  const { store, render } = deps;
  const target = payload._event.currentTarget;
  const spriteId =
    target?.dataset?.spriteId || target?.id?.replace("spriteItem", "") || "";

  store.setTempSelectedSpriteId({
    spriteId: spriteId,
  });

  render();
};

export const handleSpriteItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteId = payload._event.currentTarget.dataset.spriteId;
  const sprite = store.selectCurrentSpriteItemById({ spriteId });

  if (!sprite?.fileId) {
    return;
  }

  store.setTempSelectedSpriteId({ spriteId });
  store.showFullImagePreview({ fileId: sprite.fileId });
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
      appService.showAlert({
        message: "A sprite is required.",
        title: "Warning",
      });
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

    store.clearPendingCharacterIndex();
    store.setSelectedCharacterIndex({ index: undefined });
    store.setTempSelectedSpriteId({ spriteId: undefined });
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
    store.removeCharacter({ index: characterIndex });
  }

  store.hideDropdownMenu();
  render();
};
