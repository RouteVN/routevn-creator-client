import { toFlatItems } from "../../internal/project/tree.js";
import {
  buildCharacterSpritePreviewLayer,
  isCharacterSpriteResourceItem,
} from "../../internal/characterSpritePreview.js";
import {
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const DEFAULT_SPRITE_GROUP_ID = "base";
const DEFAULT_SPRITE_GROUP_NAME = "Sprite";
const DEFAULT_TEXT_SPEED = 75;

const toBoolean = (value) => {
  return value === true || value === "true";
};

const normalizeTextSpeed = (textSpeed, fallback = DEFAULT_TEXT_SPEED) => {
  const parsedTextSpeed = Number(textSpeed);
  if (!Number.isFinite(parsedTextSpeed)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(parsedTextSpeed)));
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
      .filter(isCharacterSpriteResourceItem)
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
  const state = store.selectSpriteSelectionState();
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

const resolveEffectiveSelectedSpriteIds = ({
  state,
  props,
  includeTemporarySpriteSelection = false,
} = {}) => {
  if (!includeTemporarySpriteSelection || state.mode !== "sprite-select") {
    return state.selectedSpriteIds;
  }

  const spriteSelectionGroups = getSpriteSelectionGroupsForCharacterId({
    characters: props?.characters,
    characterId: state.spriteCharacterId,
  });
  const selectedSpriteIds = {};

  for (const spriteSelectionGroup of spriteSelectionGroups) {
    const resourceId =
      state.tempSelectedSpriteIds?.[spriteSelectionGroup.id] ??
      state.selectedSpriteIds?.[spriteSelectionGroup.id];

    if (resourceId) {
      selectedSpriteIds[spriteSelectionGroup.id] = resourceId;
    }
  }

  return selectedSpriteIds;
};

const hasDialogueCharacter = ({
  selectedCharacterId,
  customCharacterName,
} = {}) => {
  return !!selectedCharacterId || toBoolean(customCharacterName);
};

const buildDialogueFromState = (
  deps,
  { includeTemporarySpriteSelection = false, includeContent = false } = {},
) => {
  const { store, props } = deps;
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
    appendDialogue,
    persistCharacter,
    persistSprite,
    persistSpriteExplicit,
    removePersistedSprite,
    clearPage,
    customizeTextSpeed,
    textSpeed,
  } = store.selectDialogueBuildState();
  const selectedSpriteIds = resolveEffectiveSelectedSpriteIds({
    state: store.selectDialogueBuildState(),
    props,
    includeTemporarySpriteSelection,
  });
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
    return undefined;
  }

  const dialogue = {
    mode: effectiveMode,
  };

  dialogue.ui = {
    resourceId: effectiveResourceId,
  };
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
    characterSpriteEnabled:
      characterSpriteEnabled || Object.keys(selectedSpriteIds).length > 0,
    spriteTransformId,
    selectedSpriteIds,
    spriteAnimationMode,
    spriteAnimationId,
  });
  if (characterSprite) {
    character.sprite = characterSprite;
    if (persistSpriteExplicit) {
      dialogue.persistSprite = toBoolean(persistSprite);
    }
  } else if (toBoolean(removePersistedSprite)) {
    dialogue.persistSprite = false;
  } else if (persistSpriteExplicit && toBoolean(persistSprite)) {
    dialogue.persistSprite = true;
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
  if (toBoolean(customizeTextSpeed)) {
    dialogue.textSpeed = normalizeTextSpeed(textSpeed);
  }
  if (
    includeContent &&
    !Object.hasOwn(dialogue, "content") &&
    props?.dialogue?.content !== undefined
  ) {
    dialogue.content = structuredClone(props.dialogue.content);
  }

  return dialogue;
};

const dispatchTemporaryPresentationStateChange = (deps) => {
  const { dispatchEvent } = deps;

  if (typeof dispatchEvent !== "function") {
    return;
  }

  const dialogue = buildDialogueFromState(deps, {
    includeTemporarySpriteSelection: true,
    includeContent: true,
  });

  dispatchEvent(
    new CustomEvent("temporary-presentation-state-change", {
      detail: {
        presentationState: dialogue ? { dialogue } : {},
      },
    }),
  );
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
  const customizeTextSpeed = dialogue?.textSpeed !== undefined;
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
  store.setPersistSprite({
    persistSprite: Object.hasOwn(dialogue, "persistSprite")
      ? dialogue.persistSprite === true
      : !!characterSprite && dialogue?.persistCharacter === true,
    explicit: Object.hasOwn(dialogue, "persistSprite"),
  });
  store.setRemovePersistedSprite({
    removePersistedSprite:
      !characterSprite &&
      Object.hasOwn(dialogue, "persistSprite") &&
      dialogue.persistSprite === false,
  });
  store.setAppendDialogue({
    append: selectedMode === "adv" && dialogue?.append === true,
  });

  store.setClearPage({
    clearPage: dialogue?.clearPage === true,
  });
  store.setCustomizeTextSpeed({
    customizeTextSpeed,
  });
  store.setTextSpeed({
    textSpeed: customizeTextSpeed ? dialogue.textSpeed : DEFAULT_TEXT_SPEED,
    fallback: DEFAULT_TEXT_SPEED,
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
    persistSprite,
    removePersistedSprite,
    characterSpriteEnabled,
    clearPage,
    customizeTextSpeed,
    textSpeed,
  } = store.selectDialogueFormState();
  const values = {
    mode: selectedMode,
    resourceId: selectedResourceId,
    characterId: selectedCharacterId,
    customCharacterName,
    characterName,
    characterSpriteEnabled,
    append: appendDialogue,
    persistCharacter,
    persistSprite,
    removePersistedSprite,
    clearPage,
    customizeTextSpeed,
    textSpeed: normalizeTextSpeed(textSpeed),
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

  const currentState = store.selectDialogueFormChangeState();
  const selectedMode = formValues.mode === "nvl" ? "nvl" : "adv";
  const modeChanged = selectedMode !== currentState.selectedMode;
  const customCharacterName = toBoolean(formValues.customCharacterName);
  const customizeTextSpeed = toBoolean(formValues.customizeTextSpeed);
  const textSpeedVisibilityChanged =
    customizeTextSpeed !== currentState.customizeTextSpeed;
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
  const persistSprite = currentState.characterSpriteEnabled
    ? (formValues.persistSprite ?? currentState.persistSprite)
    : currentState.persistSprite;
  const removePersistedSprite = currentState.characterSpriteEnabled
    ? false
    : (formValues.removePersistedSprite ?? currentState.removePersistedSprite);
  const appendDialogue = selectedMode === "adv" && toBoolean(formValues.append);
  store.setAppendDialogue({
    append: appendDialogue,
  });
  store.setPersistCharacter({
    persistCharacter,
  });
  store.setPersistSprite({
    persistSprite,
    explicit: currentState.persistSpriteExplicit,
  });
  store.setRemovePersistedSprite({
    removePersistedSprite,
  });
  store.setClearPage({ clearPage: formValues.clearPage });
  store.setCustomizeTextSpeed({
    customizeTextSpeed,
  });
  store.setTextSpeed({
    textSpeed: formValues.textSpeed,
    fallback: currentState.textSpeed,
  });

  render();

  if (
    modeChanged ||
    persistCharacterVisibilityChanged ||
    textSpeedVisibilityChanged
  ) {
    syncDialogueFormValues(deps);
  }

  dispatchTemporaryPresentationStateChange(deps);
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

const showCharacterSpriteMenu = async (deps, { x, y } = {}) => {
  const { store, render, appService, i18n } = deps;
  const { characterSpriteEnabled } = store.selectDialogueBuildState();

  if (!characterSpriteEnabled) {
    return;
  }

  const copy = selectCommandLineCopy(i18n);
  const result = await appService.showDropdownMenu({
    items: [
      {
        type: "item",
        label: localizeCommandLineText("Remove", copy),
        key: "remove",
      },
    ],
    x,
    y,
    place: "bs",
  });

  if (result?.item?.key !== "remove") {
    return;
  }

  store.clearCharacterSprite();
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleCharacterSpriteBoxContextMenu = async (deps, payload) => {
  const { _event: event } = payload;

  event.preventDefault();
  event.stopPropagation();

  await showCharacterSpriteMenu(deps, {
    x: event.clientX,
    y: event.clientY,
  });
};

export const handleCharacterSpriteMenuButtonClick = async (deps, payload) => {
  const { _event: event } = payload;
  const rect = event.currentTarget.getBoundingClientRect();

  event.stopPropagation();

  await showCharacterSpriteMenu(deps, {
    x: rect.left,
    y: rect.bottom,
  });
};

export const handleSpeakerSpriteTooltipMouseEnter = (deps, payload) => {
  const { store, render } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();

  store.showSpeakerSpriteTooltip({
    x: rect.left + rect.width / 2,
    y: rect.top - 8,
  });
  render();
};

export const handleSpeakerSpriteTooltipMouseLeave = (deps) => {
  const { store, render } = deps;

  store.hideSpeakerSpriteTooltip();
  render();
};

export const handleCharacterSpriteGroupBoxClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteGroupId = payload?._event?.currentTarget?.dataset?.spriteGroupId;
  const characterId = store.selectSpriteCharacterId();

  if (!characterId) {
    return;
  }

  beginSpriteSelectionForCharacter(deps, {
    characterId,
    spriteGroupId,
  });
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
    store.setTempSelectedSpriteId({
      groupId: store.selectSelectedSpriteGroupId(),
      spriteId: itemId,
    });
    render();
    dispatchTemporaryPresentationStateChange(deps);
    return;
  }

  beginSpriteSelectionForCharacter(deps, {
    characterId: itemId,
  });
  render();
  dispatchTemporaryPresentationStateChange(deps);
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
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSpriteItemClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteId = payload._event.currentTarget.dataset.spriteId;

  store.setTempSelectedSpriteId({
    groupId: store.selectSelectedSpriteGroupId(),
    spriteId,
  });

  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSpriteItemDoubleClick = (deps, payload) => {
  const { store, render, props } = deps;
  const spriteId = payload._event.currentTarget.dataset.spriteId;
  const character = getCharacterById({
    characters: props?.characters,
    characterId: store.selectSpriteCharacterId(),
  });
  const sprite = toFlatItems(
    character?.sprites ?? createEmptyCollection(),
  ).find((item) => item.id === spriteId && isCharacterSpriteResourceItem(item));

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

export const handleSpriteGroupTabClick = (deps, payload) => {
  const { store, render } = deps;
  const spriteGroupId = payload._event.detail.id;

  if (!spriteGroupId || spriteGroupId === store.selectSelectedSpriteGroupId()) {
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
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleAnimationModeChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail.value;
  store.setSpriteAnimationMode({ mode: value });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleAnimationChange = (deps, payload) => {
  const { store, render } = deps;
  const value = payload._event.detail.value;
  store.setSpriteAnimationId({ animationId: value });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handlePersistSpriteChange = (deps, payload) => {
  const { store, render } = deps;
  const { value } = payload._event.detail;

  store.setPersistSprite({ persistSprite: value });
  render();
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleButtonSelectClick = (deps) => {
  const { store, props, render } = deps;
  const state = store.selectSpriteSelectionConfirmState();

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
  dispatchTemporaryPresentationStateChange(deps);
};

export const handleSubmitClick = (deps) => {
  const { dispatchEvent } = deps;
  const dialogue = buildDialogueFromState(deps);

  if (!dialogue) {
    return;
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
    dispatchTemporaryPresentationStateChange(deps);
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
