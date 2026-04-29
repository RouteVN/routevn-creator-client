import { toFlatItems } from "../../internal/project/tree.js";

const DEFAULT_SPRITE_GROUP_ID = "base";
const DEFAULT_SPRITE_GROUP_NAME = "Sprite";

const toBoolean = (value) => {
  return value === true || value === "true";
};

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const getAnimationType = (item = {}) => {
  return item?.animation?.type === "transition" ? "transition" : "update";
};

const getAnimationModeById = (collection = {}, animationId) => {
  if (!animationId) {
    return undefined;
  }

  const item = toFlatItems(collection).find(
    (animation) =>
      animation.id === animationId && animation.type === "animation",
  );
  return item ? getAnimationType(item) : undefined;
};

const getLayoutTypeByMode = (mode) => {
  return mode === "nvl" ? "dialogue-nvl" : "dialogue-adv";
};

const resolveDialogueMode = ({ layouts, dialogue } = {}) => {
  const resourceId = dialogue?.ui?.resourceId ?? dialogue?.gui?.resourceId;
  const layoutType = (layouts ?? []).find(
    (layout) => layout.id === resourceId,
  )?.layoutType;

  if (dialogue?.mode === "nvl" || layoutType === "dialogue-nvl") {
    return "nvl";
  }

  return "adv";
};

const resolveSelectedResourceId = ({ layouts, mode, resourceId } = {}) => {
  const selectedLayoutType = getLayoutTypeByMode(mode);
  const availableLayouts = (layouts ?? []).filter(
    (layout) => layout.layoutType === selectedLayoutType,
  );

  if (
    resourceId &&
    availableLayouts.some((layout) => layout.id === resourceId)
  ) {
    return resourceId;
  }

  return availableLayouts[0]?.id ?? "";
};

const getSelectedCharacterName = ({ characters, characterId } = {}) => {
  if (!characterId) {
    return "";
  }

  return (
    (characters ?? []).find((character) => character.id === characterId)
      ?.name ?? ""
  );
};

const getCharacterById = ({ characters, characterId } = {}) => {
  if (!characterId) {
    return undefined;
  }

  return (characters ?? []).find((character) => character.id === characterId);
};

const resolveSpriteGroupId = (spriteGroup = {}, index = 0) => {
  if (typeof spriteGroup.id === "string" && spriteGroup.id.length > 0) {
    return spriteGroup.id;
  }

  return `legacy-sprite-group-${index + 1}`;
};

const resolveSpriteGroupName = (spriteGroup = {}, index = 0) => {
  if (typeof spriteGroup.name === "string" && spriteGroup.name.length > 0) {
    return spriteGroup.name;
  }

  return `Group ${index + 1}`;
};

const buildSpriteSelectionGroups = (character = {}) => {
  if (
    !Array.isArray(character?.spriteGroups) ||
    character.spriteGroups.length === 0
  ) {
    return [
      {
        id: DEFAULT_SPRITE_GROUP_ID,
        name: DEFAULT_SPRITE_GROUP_NAME,
        tags: [],
      },
    ];
  }

  return character.spriteGroups.map((spriteGroup, index) => ({
    id: resolveSpriteGroupId(spriteGroup, index),
    name: resolveSpriteGroupName(spriteGroup, index),
    tags: Array.isArray(spriteGroup?.tags) ? spriteGroup.tags : [],
  }));
};

const buildSelectedSpriteIdsByGroup = (items = []) => {
  const selectedSpriteIds = {};

  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.id || !item?.resourceId) {
      continue;
    }

    selectedSpriteIds[item.id] = item.resourceId;
  }

  return selectedSpriteIds;
};

const buildTempSelectedSpriteIdsByGroup = ({
  selectedSpriteIds,
  spriteSelectionGroups,
} = {}) => {
  const nextSelectedSpriteIds = {};
  const firstSelectedSpriteId = Object.values(selectedSpriteIds ?? {}).find(
    Boolean,
  );

  for (const [index, spriteSelectionGroup] of (
    spriteSelectionGroups ?? []
  ).entries()) {
    const selectedSpriteId = selectedSpriteIds?.[spriteSelectionGroup.id];

    if (selectedSpriteId) {
      nextSelectedSpriteIds[spriteSelectionGroup.id] = selectedSpriteId;
      continue;
    }

    if (index === 0 && firstSelectedSpriteId) {
      nextSelectedSpriteIds[spriteSelectionGroup.id] = firstSelectedSpriteId;
    }
  }

  return nextSelectedSpriteIds;
};

const resolveSelectedTransformId = ({ transforms, transformId } = {}) => {
  const transformItems = toFlatItems(
    transforms ?? createEmptyCollection(),
  ).filter((item) => item.type === "transform");

  if (
    transformId &&
    transformItems.some((transform) => transform.id === transformId)
  ) {
    return transformId;
  }

  return transformItems[0]?.id ?? "";
};

const getDefaultTransformId = (transforms) => {
  return (
    toFlatItems(transforms ?? createEmptyCollection()).find(
      (item) => item.type === "transform",
    )?.id ?? ""
  );
};

const characterHasSpriteItems = ({ character, spriteItems } = {}) => {
  const resourceIds = (Array.isArray(spriteItems) ? spriteItems : [])
    .map((item) => item?.resourceId)
    .filter(Boolean);

  if (resourceIds.length === 0) {
    return false;
  }

  const spriteIds = new Set(
    toFlatItems(character?.sprites ?? createEmptyCollection())
      .filter((item) => item.type === "image")
      .map((item) => item.id),
  );
  return resourceIds.every((resourceId) => spriteIds.has(resourceId));
};

const inferSpriteCharacterId = ({
  characters,
  selectedCharacterId,
  spriteItems,
} = {}) => {
  const selectedCharacter = getCharacterById({
    characters,
    characterId: selectedCharacterId,
  });

  if (characterHasSpriteItems({ character: selectedCharacter, spriteItems })) {
    return selectedCharacterId;
  }

  const character = (characters ?? []).find(
    (candidate) =>
      candidate?.type === "character" &&
      characterHasSpriteItems({
        character: candidate,
        spriteItems,
      }),
  );

  return character?.id ?? "";
};

const getSpriteSelectionGroupsForCharacterId = ({
  characters,
  characterId,
} = {}) => {
  return buildSpriteSelectionGroups(
    getCharacterById({
      characters,
      characterId,
    }),
  );
};

const resolveSelectedSpriteGroupId = ({
  selectedSpriteGroupId,
  spriteSelectionGroups,
} = {}) => {
  if (
    spriteSelectionGroups?.some(
      (spriteSelectionGroup) =>
        spriteSelectionGroup.id === selectedSpriteGroupId,
    )
  ) {
    return selectedSpriteGroupId;
  }

  return spriteSelectionGroups?.[0]?.id;
};

const beginSpriteSelectionForCharacter = (
  { store, props },
  { characterId, spriteGroupId } = {},
) => {
  const state = store.getState();
  const spriteSelectionGroups = getSpriteSelectionGroupsForCharacterId({
    characters: props?.characters,
    characterId,
  });
  const keepSelectedSprites = characterId === state.spriteCharacterId;
  const selectedSpriteIds = keepSelectedSprites ? state.selectedSpriteIds : {};
  const selectedSpriteGroupId =
    spriteGroupId ??
    resolveSelectedSpriteGroupId({
      selectedSpriteGroupId: state.selectedSpriteGroupId,
      spriteSelectionGroups,
    });

  store.setSpriteCharacterId({ characterId });
  if (!state.spriteTransformId) {
    store.setSpriteTransformId({
      transformId: getDefaultTransformId(props?.transforms),
    });
  }
  store.setTempSelectedSpriteIds({
    spriteIdsByGroupId: buildTempSelectedSpriteIdsByGroup({
      selectedSpriteIds,
      spriteSelectionGroups,
    }),
  });
  store.setSelectedSpriteGroupId({
    spriteGroupId: selectedSpriteGroupId,
  });
  store.setSearchQuery({ value: "" });
  store.setMode({
    mode: "sprite-select",
  });
};

const buildDialogueCharacterSprite = ({
  characters,
  transforms,
  spriteCharacterId,
  characterSpriteEnabled,
  spriteTransformId,
  selectedSpriteIds,
  spriteAnimationMode,
  spriteAnimationId,
} = {}) => {
  if (!toBoolean(characterSpriteEnabled) || !spriteCharacterId) {
    return undefined;
  }

  const selectedCharacter = getCharacterById({
    characters,
    characterId: spriteCharacterId,
  });
  const spriteSelectionGroups = selectedCharacter
    ? buildSpriteSelectionGroups(selectedCharacter)
    : Object.keys(selectedSpriteIds ?? {}).map((spriteGroupId) => ({
        id: spriteGroupId,
        name: spriteGroupId,
      }));
  const items = [];

  for (const spriteSelectionGroup of spriteSelectionGroups) {
    const resourceId = selectedSpriteIds?.[spriteSelectionGroup.id];

    if (!resourceId) {
      continue;
    }

    items.push({
      id: spriteSelectionGroup.id,
      resourceId,
    });
  }

  const resolvedTransformId = resolveSelectedTransformId({
    transforms,
    transformId: spriteTransformId,
  });

  if (!resolvedTransformId || items.length === 0) {
    return undefined;
  }

  const sprite = {
    transformId: resolvedTransformId,
    items,
  };

  if (spriteAnimationMode !== "none" && spriteAnimationId) {
    sprite.animations = {
      resourceId: spriteAnimationId,
    };
  }

  return sprite;
};

const hasDialogueCharacter = ({
  selectedCharacterId,
  customCharacterName,
} = {}) => {
  return !!selectedCharacterId || toBoolean(customCharacterName);
};

const syncDialogueStateFromProps = (deps, dialogue = {}) => {
  const { store, props } = deps;
  const selectedMode = resolveDialogueMode({
    layouts: props?.layouts,
    dialogue,
  });
  const selectedCharacterId = dialogue?.characterId ?? "";
  const customCharacterName =
    typeof dialogue?.character?.name === "string" &&
    dialogue.character.name.length > 0;
  const hasCharacter = hasDialogueCharacter({
    selectedCharacterId,
    customCharacterName,
  });
  const selectedResourceId =
    dialogue?.ui?.resourceId ?? dialogue?.gui?.resourceId ?? "";
  const characterSprite = dialogue?.character?.sprite;
  const spriteAnimationId = characterSprite?.animations?.resourceId ?? "";
  const spriteAnimationMode =
    getAnimationModeById(props?.animations, spriteAnimationId) ??
    (spriteAnimationId ? "update" : "none");
  const spriteCharacterId = characterSprite
    ? inferSpriteCharacterId({
        characters: props?.characters,
        selectedCharacterId,
        spriteItems: characterSprite?.items,
      })
    : "";

  store.setSelectedMode({
    mode: selectedMode,
  });
  store.setSelectedResource({
    resourceId: resolveSelectedResourceId({
      layouts: props?.layouts,
      mode: selectedMode,
      resourceId: selectedResourceId,
    }),
  });
  store.setSelectedCharacterId({
    characterId: selectedCharacterId,
  });
  store.setCustomCharacterName({
    customCharacterName,
  });
  store.setCharacterName({
    characterName:
      dialogue?.character?.name ??
      getSelectedCharacterName({
        characters: props?.characters,
        characterId: selectedCharacterId,
      }),
  });
  store.setSpriteCharacterId({
    characterId: spriteCharacterId,
  });
  store.setCharacterSpriteEnabled({
    characterSpriteEnabled: !!characterSprite,
  });
  store.setSpriteTransformId({
    transformId: characterSprite?.transformId ?? "",
  });
  store.setSelectedSpriteIds({
    spriteIdsByGroupId: buildSelectedSpriteIdsByGroup(characterSprite?.items),
  });
  store.setSpriteAnimationMode({
    mode: spriteAnimationMode,
  });
  store.setSpriteAnimationId({
    animationId: spriteAnimationId,
  });
  store.setPersistCharacter({
    persistCharacter: hasCharacter && dialogue?.persistCharacter === true,
  });
  store.setAppendDialogue({
    append: selectedMode === "adv" && dialogue?.append === true,
  });

  store.setClearPage({
    clearPage: dialogue?.clearPage === true,
  });
};

const syncDialogueFormValues = (deps) => {
  const { refs, store } = deps;

  if (!refs.dialogueForm) {
    return;
  }

  const {
    selectedMode,
    selectedResourceId,
    selectedCharacterId,
    customCharacterName,
    characterName,
    appendDialogue,
    persistCharacter,
    clearPage,
  } = store.getState();
  const values = {
    mode: selectedMode,
    resourceId: selectedResourceId,
    characterId: selectedCharacterId,
    customCharacterName,
    characterName,
    append: appendDialogue,
    persistCharacter,
    clearPage,
  };

  refs.dialogueForm.reset();
  refs.dialogueForm.setValues({
    values,
  });
};

export const handleBeforeMount = (deps) => {
  syncDialogueStateFromProps(deps, deps.props?.dialogue);
};

export const handleAfterMount = (deps) => {
  syncDialogueFormValues(deps);
};

export const handleOnUpdate = (deps, changes) => {
  syncDialogueStateFromProps(deps, changes?.newProps?.dialogue);
  syncDialogueFormValues(deps);
};

export const handleFormChange = (deps, payload) => {
  const { store, render, props } = deps;
  const { values: formValues } = payload._event.detail;

  if (!formValues) {
    return;
  }

  const currentState = store.getState();
  const selectedMode = formValues.mode === "nvl" ? "nvl" : "adv";
  const modeChanged = selectedMode !== currentState.selectedMode;
  const customCharacterName = toBoolean(formValues.customCharacterName);
  const selectedCharacterId = formValues.characterId ?? "";
  const hadDialogueCharacter = hasDialogueCharacter({
    selectedCharacterId: currentState.selectedCharacterId,
    customCharacterName: currentState.customCharacterName,
  });
  const hasCharacter = hasDialogueCharacter({
    selectedCharacterId,
    customCharacterName,
  });
  const persistCharacterVisibilityChanged =
    hadDialogueCharacter !== hasCharacter;
  let characterName = formValues.characterName ?? currentState.characterName;

  if (!customCharacterName) {
    characterName = getSelectedCharacterName({
      characters: props?.characters,
      characterId: selectedCharacterId,
    });
  } else if (
    currentState.customCharacterName !== true &&
    (characterName ?? "").length === 0
  ) {
    characterName = getSelectedCharacterName({
      characters: props?.characters,
      characterId: selectedCharacterId,
    });
  }

  store.setSelectedMode({ mode: selectedMode });
  store.setSelectedResource({
    resourceId: resolveSelectedResourceId({
      layouts: props?.layouts,
      mode: selectedMode,
      resourceId: formValues.resourceId ?? "",
    }),
  });
  store.setSelectedCharacterId({ characterId: selectedCharacterId });
  store.setCustomCharacterName({
    customCharacterName,
  });
  store.setCharacterName({
    characterName,
  });
  const persistCharacter =
    hasCharacter && hadDialogueCharacter ? formValues.persistCharacter : false;
  const appendDialogue = selectedMode === "adv" && toBoolean(formValues.append);
  store.setAppendDialogue({
    append: appendDialogue,
  });
  store.setPersistCharacter({
    persistCharacter,
  });
  store.setClearPage({ clearPage: formValues.clearPage });

  render();

  if (modeChanged || persistCharacterVisibilityChanged) {
    syncDialogueFormValues(deps);
  }
};

export const handleCharacterSpriteBoxClick = (deps) => {
  const { store, render } = deps;

  store.clearTempSelectedSpriteIds();
  store.setSelectedSpriteGroupId({ spriteGroupId: undefined });
  store.setSearchQuery({ value: "" });
  store.setMode({
    mode: "character-select",
  });

  render();
};

export const handleCharacterSpriteGroupBoxClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteGroupId = payload?._event?.currentTarget?.dataset?.spriteGroupId;
  const characterId = store.getState().spriteCharacterId;

  if (!characterId) {
    return;
  }

  beginSpriteSelectionForCharacter(deps, {
    characterId,
    spriteGroupId,
  });
  render();
};

export const handleClearCharacterSpriteClick = (deps, payload) => {
  const { store, render } = deps;

  payload?._event?.stopPropagation?.();
  store.clearCharacterSprite();
  render();
};

export const handleFileExplorerItemClick = (deps, payload) => {
  const { refs, store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  const mode = store.getState().mode;

  if (isFolder) {
    const groupElement = refs.galleryScroll?.querySelector(
      `[data-group-id="${itemId}"]`,
    );
    groupElement?.scrollIntoView?.({ block: "start" });
    return;
  }

  if (mode === "sprite-select") {
    store.setTempSelectedSpriteId({
      groupId: store.getState().selectedSpriteGroupId,
      spriteId: itemId,
    });
    render();
    return;
  }

  beginSpriteSelectionForCharacter(deps, {
    characterId: itemId,
  });
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  store.setSearchQuery({ value: payload._event.detail.value ?? "" });
  render();
};

export const handleCharacterItemClick = (deps, payload) => {
  const { render } = deps;
  const characterId = payload._event.currentTarget.dataset.characterId;

  beginSpriteSelectionForCharacter(deps, {
    characterId,
  });
  render();
};

export const handleSpriteItemClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteId = payload._event.currentTarget.dataset.spriteId;

  store.setTempSelectedSpriteId({
    groupId: store.getState().selectedSpriteGroupId,
    spriteId,
  });

  render();
};

export const handleSpriteItemDoubleClick = (deps, payload) => {
  const { store, render, props } = deps;
  const spriteId = payload._event.currentTarget.dataset.spriteId;
  const character = getCharacterById({
    characters: props?.characters,
    characterId: store.getState().spriteCharacterId,
  });
  const sprite = toFlatItems(
    character?.sprites ?? createEmptyCollection(),
  ).find((item) => item.id === spriteId && item.type === "image");

  if (!sprite?.fileId) {
    return;
  }

  store.setTempSelectedSpriteId({
    groupId: store.getState().selectedSpriteGroupId,
    spriteId,
  });
  store.showFullImagePreview({ fileId: sprite.fileId });
  render();
};

export const handleSpriteGroupTabClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteGroupId = payload._event.detail.id;

  if (
    !spriteGroupId ||
    spriteGroupId === store.getState().selectedSpriteGroupId
  ) {
    return;
  }

  store.setSelectedSpriteGroupId({ spriteGroupId });
  render();
};

export const handleTransformChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail.value;
  store.setSpriteTransformId({ transformId: value });
  render();
};

export const handleAnimationModeChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail.value;
  store.setSpriteAnimationMode({ mode: value });
  render();
};

export const handleAnimationChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail.value;
  store.setSpriteAnimationId({ animationId: value });
  render();
};

export const handleButtonSelectClick = (deps) => {
  const { store, props, render } = deps;
  const state = store.getState();

  if (state.mode === "sprite-select") {
    const spriteSelectionGroups = getSpriteSelectionGroupsForCharacterId({
      characters: props?.characters,
      characterId: state.spriteCharacterId,
    });
    const selectedSpriteIds = {};

    for (const spriteSelectionGroup of spriteSelectionGroups) {
      const resourceId = state.tempSelectedSpriteIds[spriteSelectionGroup.id];
      if (!resourceId) {
        continue;
      }

      selectedSpriteIds[spriteSelectionGroup.id] = resourceId;
    }

    store.setSelectedSpriteIds({
      spriteIdsByGroupId: selectedSpriteIds,
    });
    store.clearTempSelectedSpriteIds();
    store.setSelectedSpriteGroupId({ spriteGroupId: undefined });
    store.setSearchQuery({ value: "" });
    store.setMode({
      mode: "current",
    });
  }

  render();
};

export const handleSubmitClick = (deps) => {
  const { store, dispatchEvent, props } = deps;
  const {
    selectedMode,
    selectedResourceId,
    selectedCharacterId,
    customCharacterName,
    characterName,
    characterSpriteEnabled,
    spriteCharacterId,
    spriteTransformId,
    spriteAnimationMode,
    spriteAnimationId,
    selectedSpriteIds,
    appendDialogue,
    persistCharacter,
    clearPage,
  } = store.getState();
  const effectiveMode = resolveDialogueMode({
    layouts: props?.layouts,
    dialogue: {
      mode: selectedMode,
      ui: {
        resourceId: selectedResourceId,
      },
    },
  });
  const effectiveResourceId = resolveSelectedResourceId({
    layouts: props?.layouts,
    mode: effectiveMode,
    resourceId: selectedResourceId,
  });

  if (!effectiveResourceId) {
    return;
  }

  const dialogue = {
    mode: effectiveMode,
  };

  if (effectiveResourceId) {
    dialogue.ui = {
      resourceId: effectiveResourceId,
    };
  }
  if (selectedCharacterId) {
    dialogue.characterId = selectedCharacterId;
  }
  const character = {};
  if (toBoolean(customCharacterName)) {
    character.name = characterName ?? "";
  }
  const characterSprite = buildDialogueCharacterSprite({
    characters: props?.characters,
    transforms: props?.transforms,
    spriteCharacterId,
    characterSpriteEnabled,
    spriteTransformId,
    selectedSpriteIds,
    spriteAnimationMode,
    spriteAnimationId,
  });
  if (characterSprite) {
    character.sprite = characterSprite;
  }
  if (Object.keys(character).length > 0) {
    dialogue.character = character;
  }
  const persistCharacterEnabled =
    hasDialogueCharacter({
      selectedCharacterId,
      customCharacterName,
    }) && toBoolean(persistCharacter);
  const appendDialogueEnabled = toBoolean(appendDialogue);
  const appendDialoguePreviouslyEnabled = props?.dialogue?.append === true;
  if (
    effectiveMode === "adv" &&
    (appendDialogueEnabled || appendDialoguePreviouslyEnabled)
  ) {
    dialogue.append = appendDialogueEnabled;
  }
  dialogue.persistCharacter = persistCharacterEnabled;
  if (effectiveMode === "nvl" && toBoolean(clearPage)) {
    dialogue.clearPage = true;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        dialogue,
      },
    }),
  );
};

export const handleBreadcumbClick = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  const itemId = payload._event.detail.id;

  if (itemId === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
    return;
  }

  if (itemId === "current") {
    store.clearTempSelectedSpriteIds();
    store.setSelectedSpriteGroupId({ spriteGroupId: undefined });
    store.setSearchQuery({ value: "" });
    store.setMode({
      mode: "current",
    });
    render();
    return;
  }

  if (itemId === "character-select") {
    store.setSearchQuery({ value: "" });
    store.setMode({
      mode: "character-select",
    });
    render();
  }
};
