import { toFlatItems } from "../../internal/project/tree.js";
import { debugLog } from "../../deps/services/shared/debugLog.js";

const DIALOGUE_SPRITE_DEBUG_SCOPE = "dialogue-sprite";
const SPRITE_GROUP_FIELD_PREFIX = "spriteGroup:";
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
      },
    ];
  }

  return character.spriteGroups.map((spriteGroup, index) => ({
    id: resolveSpriteGroupId(spriteGroup, index),
    name: resolveSpriteGroupName(spriteGroup, index),
  }));
};

const getSpriteGroupFieldName = (spriteGroupId) => {
  return `${SPRITE_GROUP_FIELD_PREFIX}${spriteGroupId}`;
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

const buildSpriteFormValues = (selectedSpriteIds = {}) => {
  const values = {};

  for (const [spriteGroupId, spriteId] of Object.entries(selectedSpriteIds)) {
    values[getSpriteGroupFieldName(spriteGroupId)] = spriteId;
  }

  return values;
};

const getSelectedSpriteIdsFromFormValues = ({
  formValues,
  spriteSelectionGroups,
  fallbackSelectedSpriteIds,
} = {}) => {
  const selectedSpriteIds = {};

  for (const spriteSelectionGroup of spriteSelectionGroups ?? []) {
    const fieldName = getSpriteGroupFieldName(spriteSelectionGroup.id);
    const spriteId =
      formValues[fieldName] ??
      fallbackSelectedSpriteIds?.[spriteSelectionGroup.id];

    if (spriteId) {
      selectedSpriteIds[spriteSelectionGroup.id] = spriteId;
    }
  }

  return selectedSpriteIds;
};

const normalizeSpriteAnimationMode = (mode) => {
  return mode === "update" || mode === "transition" ? mode : "none";
};

const getSpriteAnimationIdFromFormValues = ({
  formValues,
  spriteAnimationMode,
  fallbackAnimationId,
} = {}) => {
  if (spriteAnimationMode === "update") {
    return formValues.updateSpriteAnimation ?? fallbackAnimationId ?? "";
  }

  if (spriteAnimationMode === "transition") {
    return formValues.transitionSpriteAnimation ?? fallbackAnimationId ?? "";
  }

  return "";
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

const buildDialogueCharacterSprite = ({
  characters,
  transforms,
  selectedCharacterId,
  characterSpriteEnabled,
  spriteTransformId,
  selectedSpriteIds,
  spriteAnimationMode,
  spriteAnimationId,
} = {}) => {
  if (!toBoolean(characterSpriteEnabled)) {
    return undefined;
  }

  const selectedCharacter = getCharacterById({
    characters,
    characterId: selectedCharacterId,
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

  const sprite = {};
  const resolvedTransformId = resolveSelectedTransformId({
    transforms,
    transformId: spriteTransformId,
  });

  if (resolvedTransformId && items.length > 0) {
    sprite.transformId = resolvedTransformId;
    sprite.items = items;
  }

  if (spriteAnimationMode !== "none" && spriteAnimationId) {
    sprite.animations = {
      resourceId: spriteAnimationId,
    };
  }

  return Object.keys(sprite).length > 0 ? sprite : undefined;
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

  store.setClearPage({
    clearPage: dialogue?.clearPage === true,
  });
};

const syncDialogueFormValues = (deps) => {
  const { refs, store } = deps;
  const {
    selectedMode,
    selectedResourceId,
    selectedCharacterId,
    customCharacterName,
    characterName,
    characterSpriteEnabled,
    spriteTransformId,
    spriteAnimationMode,
    spriteAnimationId,
    selectedSpriteIds,
    persistCharacter,
    clearPage,
  } = store.getState();
  const values = {
    mode: selectedMode,
    resourceId: selectedResourceId,
    characterId: selectedCharacterId,
    customCharacterName,
    characterName,
    characterSpriteEnabled,
    spriteTransformId,
    spriteAnimationMode,
    updateSpriteAnimation:
      spriteAnimationMode === "update" ? spriteAnimationId : "",
    transitionSpriteAnimation:
      spriteAnimationMode === "transition" ? spriteAnimationId : "",
    persistCharacter,
    clearPage,
  };

  for (const [name, value] of Object.entries(
    buildSpriteFormValues(selectedSpriteIds),
  )) {
    values[name] = value;
  }

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
  const selectedCharacterChanged =
    selectedCharacterId !== currentState.selectedCharacterId;
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
  const characterSpriteEnabled = toBoolean(
    formValues.characterSpriteEnabled ?? currentState.characterSpriteEnabled,
  );
  const selectedCharacter = getCharacterById({
    characters: props?.characters,
    characterId: selectedCharacterId,
  });
  const spriteSelectionGroups = buildSpriteSelectionGroups(selectedCharacter);
  const selectedSpriteIds =
    characterSpriteEnabled && selectedCharacter && !selectedCharacterChanged
      ? getSelectedSpriteIdsFromFormValues({
          formValues,
          spriteSelectionGroups,
          fallbackSelectedSpriteIds: currentState.selectedSpriteIds,
        })
      : characterSpriteEnabled && !selectedCharacterChanged
        ? currentState.selectedSpriteIds
        : {};
  const spriteAnimationMode = characterSpriteEnabled
    ? normalizeSpriteAnimationMode(
        formValues.spriteAnimationMode ?? currentState.spriteAnimationMode,
      )
    : "none";
  const spriteAnimationId = getSpriteAnimationIdFromFormValues({
    formValues,
    spriteAnimationMode,
    fallbackAnimationId: currentState.spriteAnimationId,
  });

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
  store.setCharacterSpriteEnabled({
    characterSpriteEnabled,
  });
  store.setSpriteTransformId({
    transformId: characterSpriteEnabled
      ? (formValues.spriteTransformId ?? currentState.spriteTransformId)
      : "",
  });
  store.setSelectedSpriteIds({
    spriteIdsByGroupId: selectedSpriteIds,
  });
  store.setSpriteAnimationMode({
    mode: spriteAnimationMode,
  });
  store.setSpriteAnimationId({
    animationId: spriteAnimationId,
  });
  const persistCharacter =
    hasCharacter && hadDialogueCharacter ? formValues.persistCharacter : false;
  store.setPersistCharacter({
    persistCharacter,
  });
  store.setClearPage({ clearPage: formValues.clearPage });

  render();

  if (
    modeChanged ||
    persistCharacterVisibilityChanged ||
    selectedCharacterChanged ||
    currentState.characterSpriteEnabled !== characterSpriteEnabled
  ) {
    syncDialogueFormValues(deps);
  }
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
    spriteTransformId,
    spriteAnimationMode,
    spriteAnimationId,
    selectedSpriteIds,
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

  // Create dialogue object with only non-empty values
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
    selectedCharacterId,
    characterSpriteEnabled,
    spriteTransformId,
    selectedSpriteIds,
    spriteAnimationMode,
    spriteAnimationId,
  });
  if (characterSprite) {
    character.sprite = characterSprite;
  }
  debugLog(DIALOGUE_SPRITE_DEBUG_SCOPE, "dialogue-box.submit", {
    selectedCharacterId,
    characterSpriteEnabled,
    spriteTransformId,
    selectedSpriteIds,
    spriteAnimationMode,
    spriteAnimationId,
    characterSprite,
  });
  if (Object.keys(character).length > 0) {
    dialogue.character = character;
  }
  const persistCharacterEnabled =
    hasDialogueCharacter({
      selectedCharacterId,
      customCharacterName,
    }) && toBoolean(persistCharacter);
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
  const { dispatchEvent } = deps;

  if (payload._event.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  }
};
