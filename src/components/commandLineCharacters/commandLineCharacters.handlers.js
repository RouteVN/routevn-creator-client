import {
  findCharacterItemsMissingSprites,
  logCharacterSpritesDebug,
  summarizeCharacterSpriteActionItems,
  summarizeCharacterSpriteRepository,
} from "../../internal/characterSpriteDebug.js";
import { buildCharacterSpritePreviewLayer } from "../../internal/characterSpritePreview.js";

const getCharacterIndexFromEvent = (event) => {
  const index = Number.parseInt(event?.currentTarget?.dataset?.index, 10);
  return Number.isInteger(index) ? index : undefined;
};

const getEventValue = (event) =>
  event?.detail?.value ?? event?.currentTarget?.value ?? event?.target?.value;

const TRANSFORM_FIELDS = [
  "x",
  "y",
  "anchorX",
  "anchorY",
  "scaleX",
  "scaleY",
  "rotation",
  "originX",
  "originY",
];

const hasInlineTransform = (item = {}) =>
  TRANSFORM_FIELDS.some((field) => item?.[field] !== undefined);

const assignInlineTransformFields = (target, source = {}) => {
  if (!hasInlineTransform(source)) {
    return;
  }

  for (const field of TRANSFORM_FIELDS) {
    if (source[field] !== undefined) {
      target[field] = source[field];
    }
  }
};

const getDropdownPositionFromEvent = (event) => {
  const rect = event?.currentTarget?.getBoundingClientRect?.();
  if (rect) {
    return { x: rect.left, y: rect.bottom };
  }

  return {
    x: event?.clientX ?? 0,
    y: event?.clientY ?? 0,
  };
};

const beginAddCharacterSelection = (store) => {
  store.clearPendingCharacterIndex();
  store.setSelectedCharacterIndex({ index: undefined });
  store.clearTempSelectedSpriteIds();
  store.setSelectedSpriteGroupId({ spriteGroupId: undefined });
  store.setSearchQuery({ value: "" });
  store.setMode({
    mode: "character-select",
  });
};

const buildTempSelectedSpriteIdsByGroup = ({
  character,
  spriteSelectionGroups,
} = {}) => {
  const nextSelectedSpriteIds = {};
  const currentSprites = Array.isArray(character?.sprites)
    ? character.sprites
    : [];
  const firstSelectedSpriteId = currentSprites.find(
    (sprite) =>
      typeof sprite?.resourceId === "string" && sprite.resourceId.length > 0,
  )?.resourceId;

  for (const [index, spriteSelectionGroup] of (
    spriteSelectionGroups ?? []
  ).entries()) {
    const matchingSprite = currentSprites.find(
      (sprite) =>
        sprite?.id === spriteSelectionGroup.id &&
        typeof sprite?.resourceId === "string" &&
        sprite.resourceId.length > 0,
    );

    if (matchingSprite?.resourceId) {
      nextSelectedSpriteIds[spriteSelectionGroup.id] =
        matchingSprite.resourceId;
      continue;
    }

    if (index === 0 && firstSelectedSpriteId) {
      nextSelectedSpriteIds[spriteSelectionGroup.id] = firstSelectedSpriteId;
    }
  }

  return nextSelectedSpriteIds;
};

const beginExistingCharacterSpriteSelection = (store, index) => {
  const selectedCharacters = store.selectSelectedCharacters();
  const selectedCharacter = selectedCharacters[index];
  const spriteSelectionGroups =
    store.selectSpriteSelectionGroupsForCharacterIndex({
      index,
    });

  store.clearPendingCharacterIndex();
  store.setSelectedCharacterIndex({ index });
  store.setTempSelectedSpriteIds({
    spriteIdsByGroupId: buildTempSelectedSpriteIdsByGroup({
      character: selectedCharacter,
      spriteSelectionGroups,
    }),
  });
  store.setSelectedSpriteGroupId({
    spriteGroupId: spriteSelectionGroups[0]?.id,
  });
  store.setSearchQuery({ value: "" });
  store.setMode({
    mode: "sprite-select",
  });
};

const beginExistingCharacterSpriteSelectionAtGroup = (
  store,
  index,
  spriteGroupId,
) => {
  const spriteSelectionGroups =
    store.selectSpriteSelectionGroupsForCharacterIndex({
      index,
    });
  const resolvedSpriteGroupId = spriteSelectionGroups.some(
    (spriteSelectionGroup) => spriteSelectionGroup.id === spriteGroupId,
  )
    ? spriteGroupId
    : spriteSelectionGroups[0]?.id;

  beginExistingCharacterSpriteSelection(store, index);
  store.setSelectedSpriteGroupId({
    spriteGroupId: resolvedSpriteGroupId,
  });
};

const beginNewCharacterSpriteSelection = (store, characterId) => {
  store.addCharacter({
    id: characterId,
    transformId: store.selectPendingCharacterTransformId?.(),
  });

  const currentCharacters = store.selectSelectedCharacters();
  const newCharacterIndex = currentCharacters.length - 1;
  const spriteSelectionGroups =
    store.selectSpriteSelectionGroupsForCharacterIndex({
      index: newCharacterIndex,
    });

  store.setPendingCharacterIndex({ index: newCharacterIndex });
  store.setSelectedCharacterIndex({ index: newCharacterIndex });
  store.setTempSelectedSpriteIds({
    spriteIdsByGroupId: buildTempSelectedSpriteIdsByGroup({
      character: currentCharacters[newCharacterIndex],
      spriteSelectionGroups,
    }),
  });
  store.setSelectedSpriteGroupId({
    spriteGroupId: spriteSelectionGroups[0]?.id,
  });
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

const buildCharacterItemsFromState = (
  store,
  { includeTemporarySprites = false } = {},
) => {
  const selectedCharacters = store.selectSelectedCharacters();
  const mode = store.selectMode?.();
  const selectedCharacterIndex = store.selectSelectedCharacterIndex?.();
  const shouldUseTemporarySprites =
    includeTemporarySprites &&
    mode === "sprite-select" &&
    Number.isInteger(selectedCharacterIndex);
  const spriteSelectionGroups = shouldUseTemporarySprites
    ? store.selectCurrentSpriteSelectionGroups()
    : [];
  const tempSelectedSpriteIds = shouldUseTemporarySprites
    ? store.selectTempSelectedSpriteIds()
    : {};

  return selectedCharacters.map((char, index) => {
    const item = {
      id: char.id,
      transformId: char.transformId,
      sprites: char.sprites || [],
      spriteName: char.spriteName || "",
    };

    assignInlineTransformFields(item, char);

    if (char.opacity !== undefined) {
      item.opacity = char.opacity;
    }

    if (char.blur !== undefined) {
      item.blur = char.blur === null ? null : { ...char.blur };
    }

    if (shouldUseTemporarySprites && index === selectedCharacterIndex) {
      item.sprites = spriteSelectionGroups
        .map((spriteSelectionGroup) => {
          const resourceId = tempSelectedSpriteIds[spriteSelectionGroup.id];
          if (!resourceId) {
            return undefined;
          }

          return {
            id: spriteSelectionGroup.id,
            resourceId,
          };
        })
        .filter(Boolean);
    }

    if (char.animations?.resourceId) {
      item.animations = {
        resourceId: char.animations.resourceId,
      };
    }

    return item;
  });
};

const buildCharacterDataFromState = (
  store,
  { includeTemporarySprites = false } = {},
) => ({
  character: {
    items: buildCharacterItemsFromState(store, {
      includeTemporarySprites,
    }),
  },
});

const dispatchTemporaryPresentationStateChange = (deps) => {
  const { dispatchEvent, store } = deps;

  if (typeof dispatchEvent !== "function") {
    return;
  }

  const presentationState = buildCharacterDataFromState(store, {
    includeTemporarySprites: true,
  });
  const characterItems = presentationState.character?.items ?? [];
  logCharacterSpritesDebug("commandLineCharacters.temporary.emit", {
    mode: store.selectMode?.(),
    selectedCharacterIndex: store.selectSelectedCharacterIndex?.(),
    selectedSpriteGroupId: store.selectSelectedSpriteGroupId?.(),
    tempSelectedSpriteIds: store.selectTempSelectedSpriteIds?.(),
    characterItems: summarizeCharacterSpriteActionItems(characterItems),
    missingSpriteItems: summarizeCharacterSpriteActionItems(
      findCharacterItemsMissingSprites(characterItems),
    ),
  });

  dispatchEvent(
    new CustomEvent("temporary-presentation-state-change", {
      detail: {
        presentationState,
      },
    }),
  );
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

  logCharacterSpritesDebug("commandLineCharacters.mount", {
    incomingCharacterItems: summarizeCharacterSpriteActionItems(
      characterItems ?? [],
    ),
    repositoryCharacters: summarizeCharacterSpriteRepository({
      charactersCollection: characters,
      characterIds: (characterItems ?? []).map((item) => item?.id),
    }),
  });

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

export const handleCharacterSpriteGroupBoxClick = (deps, payload) => {
  const { store, render } = deps;
  const index = getCharacterIndexFromEvent(payload._event);
  const spriteGroupId = payload?._event?.currentTarget?.dataset?.spriteGroupId;

  if (index === undefined || !spriteGroupId) {
    return;
  }

  beginExistingCharacterSpriteSelectionAtGroup(store, index, spriteGroupId);
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
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleTransformModeChange = (deps, payload) => {
  const { store, render } = deps;
  const index = getCharacterIndexFromEvent(payload._event);
  if (index === undefined) {
    return;
  }

  store.updateCharacterCustomTransformEnabled({
    index,
    enabled: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleCustomTransformButtonClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { dispatchEvent, store, render } = deps;
  const index = getCharacterIndexFromEvent(payload._event);
  const character = store.selectSelectedCharacters()?.[index];
  if (index === undefined || !character) {
    return;
  }

  const item = buildCharacterItemsFromState(store)[index];
  store.openCustomTransformEditor?.();
  render();
  dispatchEvent(
    new CustomEvent("action-transform-customize", {
      detail: {
        targetType: "character",
        actionKey: "character",
        itemIndex: index,
        item,
        action: buildCharacterDataFromState(store, {
          includeTemporarySprites: true,
        }).character,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSetCustomTransform = (deps, { index, transform } = {}) => {
  const { store, render } = deps;
  store.updateCharacterCustomTransform({ index, transform });
  store.closeCustomTransformEditor?.();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleCustomTransformDoneButtonClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { dispatchEvent, store, render } = deps;
  store.closeCustomTransformEditor?.();
  render();
  dispatchEvent(
    new CustomEvent("action-transform-editor-done", {
      detail: {},
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleCancelCustomTransformEditor = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  payload?._event?.stopImmediatePropagation?.();
  const { store, render } = deps;

  store.closeCustomTransformEditor?.();
  render?.();
};

export const handleGetBackgroundTransformPreviewCanvasRoot = ({ refs }) => {
  const canvasHost = refs?.backgroundTransformPreviewCanvasHost;
  return (
    canvasHost?.getCanvasRoot?.() ||
    canvasHost?.shadowRoot?.querySelector?.("#canvas") ||
    canvasHost?.querySelector?.("#canvas")
  );
};

export const handleAnimationChange = (deps, payload) => {
  const { store, render } = deps;
  const index = Number.parseInt(payload._event.currentTarget.dataset.index, 10);
  const value = payload._event.detail.value;
  store.updateCharacterAnimation({ index, animationId: value });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleOpacityInput = (deps, payload) => {
  const { store, render } = deps;
  const index = getCharacterIndexFromEvent(payload._event);

  if (index === undefined) {
    return;
  }

  store.updateCharacterOpacity({
    index,
    opacity: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleBlurToggleChange = (deps, payload) => {
  const { store, render } = deps;
  const index = getCharacterIndexFromEvent(payload._event);

  if (index === undefined) {
    return;
  }

  store.updateCharacterBlurEnabled({
    index,
    enabled: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleBlurFieldInput = (deps, payload) => {
  const { store, render } = deps;
  const index = getCharacterIndexFromEvent(payload._event);
  const fieldName = payload._event.currentTarget?.dataset?.blurField;

  if (index === undefined) {
    return;
  }

  store.updateCharacterBlurField({
    index,
    fieldName,
    value: getEventValue(payload._event),
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleBlurFieldChange = handleBlurFieldInput;

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
    store.setTempSelectedSpriteId({
      groupId: store.selectSelectedSpriteGroupId(),
      spriteId: itemId,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  beginNewCharacterSpriteSelection(store, itemId);
  render();
  dispatchTemporaryPresentationStateChange(deps);
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
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSpriteGroupTabClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteGroupId = payload._event.detail.id;

  if (!spriteGroupId || spriteGroupId === store.selectSelectedSpriteGroupId()) {
    return;
  }

  store.setSelectedSpriteGroupId({ spriteGroupId });
  render();
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent, store } = deps;
  const characterData = buildCharacterDataFromState(store);
  const characterItems = characterData.character?.items ?? [];
  logCharacterSpritesDebug("commandLineCharacters.submit", {
    characterItems: summarizeCharacterSpriteActionItems(characterItems),
    missingSpriteItems: summarizeCharacterSpriteActionItems(
      findCharacterItemsMissingSprites(characterItems),
    ),
  });

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

  store.clearPendingCharacterTransformId?.();
  beginAddCharacterSelection(store);
  render();
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  const mode = store.selectMode();
  const targetId = payload._event.detail.id;

  if (mode === "sprite-select") {
    discardPendingCharacterSelection(store);
    store.setSelectedCharacterIndex({ index: undefined });
    store.clearTempSelectedSpriteIds();
    store.setSelectedSpriteGroupId({ spriteGroupId: undefined });
  }

  if (targetId === "actions") {
    store.clearPendingCharacterTransformId?.();
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (targetId === "current") {
    store.clearPendingCharacterTransformId?.();
    store.setMode({
      mode: "current",
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
  } else if (targetId === "character-select") {
    store.setSearchQuery({ value: "" });
    store.setMode({
      mode: "character-select",
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
  }
};

export const handleRemoveCharacterClick = (deps, payload) => {
  const { store, render } = deps;
  const index = parseInt(
    payload._event.currentTarget.id.replace("removeCharacter", ""),
  );

  store.removeCharacter({ index: index });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleAddCharacterClick = (deps, payload = {}) => {
  const { store, render } = deps;
  const transformItems =
    store.selectAddCharacterTransformDropdownItems?.() ?? [];

  store.clearPendingCharacterTransformId?.();

  if (transformItems.length === 0) {
    beginAddCharacterSelection(store);
    render();
    return;
  }

  store.showAddCharacterTransformDropdownMenu({
    position: getDropdownPositionFromEvent(payload._event),
  });
  render();
};

export const handleSpriteItemClick = (deps, payload) => {
  const { store, render } = deps;
  const target = payload._event.currentTarget;
  const spriteId =
    target?.dataset?.spriteId || target?.id?.replace("spriteItem", "") || "";

  store.setTempSelectedSpriteId({
    groupId: store.selectSelectedSpriteGroupId(),
    spriteId,
  });

  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSpriteItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteId = payload._event.currentTarget.dataset.spriteId;
  const sprite = store.selectCurrentSpriteItemById({ spriteId });

  if (!sprite?.fileId) {
    return;
  }

  const previewLayer = buildCharacterSpritePreviewLayer(sprite);
  store.setTempSelectedSpriteId({
    groupId: store.selectSelectedSpriteGroupId(),
    spriteId,
  });
  store.showFullImagePreview({
    fileId: previewLayer.fileId,
    kind: previewLayer.kind,
    atlas: previewLayer.atlas,
    animation: previewLayer.animation,
    previewKey: previewLayer.previewKey,
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleButtonSelectClick = (deps) => {
  const { store, render } = deps;
  const mode = store.selectMode();
  const selectedCharacterIndex = store.selectSelectedCharacterIndex();

  if (mode === "sprite-select") {
    const spriteSelectionGroups = store.selectCurrentSpriteSelectionGroups();
    const tempSelectedSpriteIds = store.selectTempSelectedSpriteIds();

    store.updateCharacterSprites({
      index: selectedCharacterIndex,
      sprites: spriteSelectionGroups
        .map((spriteSelectionGroup) => {
          const resourceId = tempSelectedSpriteIds[spriteSelectionGroup.id];
          if (!resourceId) {
            return undefined;
          }

          return {
            id: spriteSelectionGroup.id,
            resourceId,
          };
        })
        .filter(Boolean),
    });

    logCharacterSpritesDebug("commandLineCharacters.spriteSelect.confirm", {
      selectedCharacterIndex,
      spriteSelectionGroups,
      tempSelectedSpriteIds,
      selectedCharacters: summarizeCharacterSpriteActionItems(
        store.selectSelectedCharacters?.(),
      ),
    });

    store.clearPendingCharacterIndex();
    store.clearPendingCharacterTransformId?.();
    store.setSelectedCharacterIndex({ index: undefined });
    store.clearTempSelectedSpriteIds();
    store.setSelectedSpriteGroupId({ spriteGroupId: undefined });
    store.setMode({
      mode: "current",
    });
  }

  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (deps, payload) => {
  const { store, render } = deps;
  const { item } = payload._event.detail;
  const dropdownMenuType = store.selectDropdownMenuType?.();
  const characterIndex = store.selectDropdownMenuCharacterIndex();
  const hasCharacterIndex = Number.isInteger(characterIndex);
  let shouldDispatchTemporaryPresentationStateChange = false;

  if (dropdownMenuType === "add-character-transform") {
    store.setPendingCharacterTransformId({
      transformId: item.transformId ?? item.value,
    });
    beginAddCharacterSelection(store);
  } else if (item.value === "delete" && hasCharacterIndex) {
    store.removeCharacter({ index: characterIndex });
    shouldDispatchTemporaryPresentationStateChange = true;
  } else if (item.value === "move-up" && hasCharacterIndex) {
    store.moveCharacter({ index: characterIndex, offset: 1 });
    shouldDispatchTemporaryPresentationStateChange = true;
  } else if (item.value === "move-down" && hasCharacterIndex) {
    store.moveCharacter({ index: characterIndex, offset: -1 });
    shouldDispatchTemporaryPresentationStateChange = true;
  }

  store.hideDropdownMenu();
  render();
  if (shouldDispatchTemporaryPresentationStateChange) {
    dispatchTemporaryPresentationStateChange(deps);
  }
};
