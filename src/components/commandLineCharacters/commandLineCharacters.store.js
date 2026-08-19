import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  canLoopAnimationById,
  createAnimationReference,
  getAnimationModeById,
  getAnimationType,
  normalizeAnimationPlaybackContinuity,
  normalizeAnimationPlaybackLoop,
  normalizeAnimationPlaybackSpeed,
} from "../../internal/animationPlayback.js";
import {
  buildCharacterSpritePreviewLayer,
  buildCharacterSpritePreviewFileIds,
  buildCharacterSpritePreviewLayers,
  isCharacterSpriteResourceItem,
} from "../../internal/characterSpritePreview.js";
import {
  COMMAND_LINE_ITEM_FLIP_OPTIONS,
  COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_SELECT_OPTIONS,
  COMMAND_LINE_ITEM_BLUR_REPEAT_EDGE_OPTIONS,
  DEFAULT_COMMAND_LINE_ITEM_BLUR,
  DEFAULT_COMMAND_LINE_ITEM_OPACITY,
  normalizeCommandLineItemBlur,
  normalizeCommandLineItemBlurEnabled,
  normalizeCommandLineItemBlurWithField,
  normalizeCommandLineItemEffects,
  normalizeCommandLineItemOpacity,
  getCommandLineItemFlipOption,
} from "../../internal/commandLineItemEffects.js";
import {
  createCommandLineShaderAdjustmentControls,
  getCommandLineShaderAdjustment,
  getCommandLineShaderAdjustmentValue,
  orderCommandLineShaderAdjustmentFilters,
  removeCommandLineShaderAdjustmentFilter,
  setCommandLineShaderAdjustmentFilter,
} from "../../internal/commandLineShaderAdjustments.js";
import {
  BACKGROUND_TRANSFORM_FIELDS,
  createActionItemWithInlineTransform,
  formatBackgroundTransformEditorMetric,
  hasInlineTransform,
  normalizeBackgroundTransformEditorTransform,
  removeInlineTransformFields,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineDropdownMenu,
  localizeCommandLineForm,
  localizeCommandLineOptions,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";
import { createCommandLineResourceSelectorLayout } from "../../internal/ui/sceneEditor/commandLineResourceSelectorLayout.js";
import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const UNGROUPED_CHARACTER_GROUP_ID = "__ungrouped_characters__";
const UNGROUPED_SPRITE_GROUP_ID = "__ungrouped_sprites__";
const UNGROUPED_GROUP_LABEL = "Ungrouped";
const DEFAULT_SPRITE_GROUP_ID = "base";
const DEFAULT_SPRITE_GROUP_NAME = "Sprite";
const TRANSFORM_MODE_OPTIONS = [
  { value: false, label: "Predefined" },
  { value: true, label: "Custom" },
];
const ANIMATION_PLAYBACK_LOOP_OPTIONS = [
  { value: false, label: "Don't Loop" },
  { value: true, label: "Loop" },
];
const ANIMATION_PLAYBACK_CONTINUITY_OPTIONS = [
  { value: "render", label: "Single Line" },
  { value: "persistent", label: "Persistent" },
];
const createCharacterContextDropdownItems = (
  characterIndex,
  characters = [],
) => {
  const items = [];

  if (characterIndex < characters.length - 1) {
    items.push({ label: "Move Up", type: "item", value: "move-up" });
  }

  if (characterIndex > 0) {
    items.push({ label: "Move Down", type: "item", value: "move-down" });
  }

  items.push({ label: "Delete", type: "item", value: "delete" });
  return items;
};

const createAddCharacterTransformDropdownItems = (transforms = {}) =>
  toFlatItems(transforms)
    .filter((item) => item.type === "transform")
    .map((transform) => ({
      label: transform.name ?? "Unnamed Transform",
      transformId: transform.id,
      type: "item",
      value: transform.id,
    }));

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

const orderSpriteSelectionGroupsTopFirst = (spriteSelectionGroups = []) =>
  spriteSelectionGroups.slice().reverse();

const findFirstSpriteIdForGroup = ({
  group,
  spritesCollection,
  allowUntaggedGroupFallback = false,
} = {}) => {
  const hasTags = Array.isArray(group?.tags) && group.tags.length > 0;
  if (!hasTags && !allowUntaggedGroupFallback) {
    return undefined;
  }

  return toFlatItems(spritesCollection ?? createEmptyCollection()).find(
    (item) =>
      isCharacterSpriteResourceItem(item) &&
      matchesSpriteGroupTags({
        item,
        tagIds: group?.tags,
      }),
  )?.id;
};

const buildDefaultCharacterSprites = ({ characterData } = {}) => {
  const spriteSelectionGroups = buildSpriteSelectionGroups(characterData);
  const sprites = [];
  let hasUntaggedGroupFallback = false;

  for (const spriteSelectionGroup of spriteSelectionGroups) {
    const hasTags =
      Array.isArray(spriteSelectionGroup.tags) &&
      spriteSelectionGroup.tags.length > 0;
    const resourceId = findFirstSpriteIdForGroup({
      group: spriteSelectionGroup,
      spritesCollection: characterData?.sprites,
      allowUntaggedGroupFallback: hasTags || !hasUntaggedGroupFallback,
    });

    if (!resourceId) {
      continue;
    }

    sprites.push({
      id: spriteSelectionGroup.id,
      resourceId,
    });

    if (!hasTags) {
      hasUntaggedGroupFallback = true;
    }
  }

  return sprites;
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

const buildSpriteGroupBoxViewData = ({
  spriteSelectionGroups,
  selectedSpriteIdsByGroup,
  spritesCollection,
  copy,
} = {}) => {
  const spriteItemsById = Object.fromEntries(
    toFlatItems(spritesCollection ?? createEmptyCollection())
      .filter(isCharacterSpriteResourceItem)
      .map((item) => [item.id, item]),
  );

  return orderSpriteSelectionGroupsTopFirst(spriteSelectionGroups).map(
    (spriteSelectionGroup) => {
      const selectedSpriteId =
        selectedSpriteIdsByGroup?.[spriteSelectionGroup.id];
      const selectedSprite = selectedSpriteId
        ? spriteItemsById[selectedSpriteId]
        : undefined;

      return {
        id: spriteSelectionGroup.id,
        name: spriteSelectionGroup.name,
        selectedSpriteId,
        selectedSpriteName:
          selectedSprite?.name ?? localizeCommandLineText("No sprite", copy),
        hasSelection: !!selectedSpriteId,
        backgroundColor: selectedSpriteId ? "mu" : "bg",
      };
    },
  );
};

const buildSpritePreviewItemViewData = (item = {}) => {
  const previewLayer = buildCharacterSpritePreviewLayer(item);
  return {
    ...item,
    previewKind: previewLayer?.kind,
    previewFileId: previewLayer?.fileId,
    previewAtlas: previewLayer?.atlas,
    previewAnimation: previewLayer?.animation,
    previewKey: previewLayer?.previewKey,
  };
};

const matchesSpriteGroupTags = ({ item, tagIds } = {}) => {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    return true;
  }

  const itemTagIds = Array.isArray(item?.tagIds) ? item.tagIds : [];
  return tagIds.some((tagId) => itemTagIds.includes(tagId));
};

const normalizeSelectedCharacter = (character = {}, animations = {}) => {
  const nextCharacter = normalizeCommandLineItemEffects(
    structuredClone(character ?? {}),
  );
  nextCharacter.opacityOptionEnabled =
    nextCharacter.opacityOptionEnabled ?? nextCharacter.opacity !== undefined;
  nextCharacter.blurOptionEnabled = Boolean(nextCharacter.blur);
  if (Array.isArray(nextCharacter.filters)) {
    nextCharacter.filters = orderCommandLineShaderAdjustmentFilters(
      nextCharacter.filters,
    );
  }
  const selectedAnimationId = nextCharacter?.animations?.resourceId;
  const selectedAnimationMode = getAnimationModeById(
    animations,
    selectedAnimationId,
  );

  nextCharacter.animationMode =
    nextCharacter.animationMode ??
    selectedAnimationMode ??
    (selectedAnimationId ? "update" : "none");
  if (selectedAnimationId) {
    nextCharacter.animations = createAnimationReference({
      animationId: selectedAnimationId,
      animations,
      playback: nextCharacter.animations?.playback,
      animationMode: nextCharacter.animationMode,
    });
  }

  return nextCharacter;
};

export const createInitialState = () => ({
  mode: "current",
  isTouchMode: false,
  items: createEmptyCollection(),
  transforms: createEmptyCollection(),
  animations: createEmptyCollection(),
  /**
   * Array of raw character objects with the following structure (same as props):
   * {
   *   id: string,              // Character ID from repository
   *   transformId: string,     // Transform ID
   *   animations: object,      // Optional animation selection with resourceId
   *   sprites: array,          // Array of sprites with resourceId
   *   spriteName: string       // Display name for sprite
   * }
   */
  selectedCharacters: [],
  tempSelectedCharacterId: undefined,
  tempSelectedSpriteIds: {},
  selectedSpriteGroupId: undefined,
  selectedCharacterIndex: undefined, // For sprite selection
  pendingCharacterIndex: undefined,
  pendingCharacterTransformId: undefined,
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewKind: "image",
  fullImagePreviewFileId: undefined,
  fullImagePreviewAtlas: undefined,
  fullImagePreviewAnimation: undefined,
  fullImagePreviewKey: undefined,
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    type: "character-context",
    characterIndex: null,
    items: createCharacterContextDropdownItems(),
  },
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setItems = ({ state }, { items } = {}) => {
  state.items = items;
};

export const setTransforms = ({ state }, { transforms } = {}) => {
  state.transforms = transforms;
};

export const setAnimations = ({ state }, { animations } = {}) => {
  state.animations = animations;
  state.selectedCharacters = state.selectedCharacters.map((character) =>
    normalizeSelectedCharacter(character, state.animations),
  );
};

const getTransformItems = (state) =>
  toFlatItems(state.transforms).filter((item) => item.type === "transform");

const getDefaultTransformId = (state) => {
  const transformItems = getTransformItems(state);
  return transformItems.length > 0 ? transformItems[0].id : undefined;
};

const getTransformResourceById = (state, transformId) => {
  if (!transformId) {
    return undefined;
  }

  return getTransformItems(state).find((item) => item.id === transformId);
};

const getSelectedTransformResource = (state, character = {}) => {
  return getTransformResourceById(
    state,
    character.transformId ?? getDefaultTransformId(state),
  );
};

const createCustomTransformDetails = (character = {}) => {
  const transform = normalizeBackgroundTransformEditorTransform(character);

  return [
    {
      label: "Position",
      value: `${formatBackgroundTransformEditorMetric(transform.x)}, ${formatBackgroundTransformEditorMetric(transform.y)}`,
    },
    {
      label: "Scale",
      value: `${formatBackgroundTransformEditorMetric(transform.scaleX)} x ${formatBackgroundTransformEditorMetric(transform.scaleY)}`,
    },
  ];
};

const applyCharacterInlineTransform = (character, transform) => {
  const nextCharacter = createActionItemWithInlineTransform(
    character,
    transform,
    { preserveTransformId: true },
  );

  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    character[field] = nextCharacter[field];
  }
};

const clearCharacterInlineTransform = (character) => {
  const nextCharacter = removeInlineTransformFields(character);
  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    delete character[field];
  }
  if (!character.transformId) {
    character.transformId = nextCharacter.transformId;
  }
};

const getInlineTransformFields = (item = {}) => {
  const fields = {};
  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    if (item[field] !== undefined) {
      fields[field] = item[field];
    }
  }
  return fields;
};

const getCharacterItemById = ({ state, characterId } = {}) => {
  if (!characterId) {
    return undefined;
  }

  return toFlatItems(state.items || []).find(
    (item) => item.id === characterId && item.type === "character",
  );
};

const getSpriteSelectionGroupsForCharacterId = ({ state, characterId } = {}) =>
  buildSpriteSelectionGroups(getCharacterItemById({ state, characterId }));

const getSpriteSelectionGroupsForCharacterIndex = ({ state, index } = {}) => {
  if (!Number.isInteger(index)) {
    return [];
  }

  const characterId = state.selectedCharacters?.[index]?.id;
  return getSpriteSelectionGroupsForCharacterId({ state, characterId });
};

const resolveSelectedSpriteGroupId = ({
  state,
  spriteSelectionGroups,
} = {}) => {
  if (
    spriteSelectionGroups?.some(
      (spriteSelectionGroup) =>
        spriteSelectionGroup.id === state.selectedSpriteGroupId,
    )
  ) {
    return state.selectedSpriteGroupId;
  }

  return orderSpriteSelectionGroupsTopFirst(spriteSelectionGroups)[0]?.id;
};

export const addCharacter = ({ state }, { id, transformId } = {}) => {
  const defaultTransform = transformId ?? getDefaultTransformId(state);
  const characterData = getCharacterItemById({
    state,
    characterId: id,
  });

  // Source order is bottom-first while the form displays characters top-first.
  state.selectedCharacters.unshift({
    id: id,
    transformId: defaultTransform,
    sprites: buildDefaultCharacterSprites({ characterData }),
    spriteName: "",
    animationMode: "none",
    opacityOptionEnabled: false,
    blurOptionEnabled: false,
  });

  if (Number.isInteger(state.selectedCharacterIndex)) {
    state.selectedCharacterIndex += 1;
  }
  if (Number.isInteger(state.pendingCharacterIndex)) {
    state.pendingCharacterIndex += 1;
  }
};

export const removeCharacter = ({ state }, { index } = {}) => {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.selectedCharacters.length
  ) {
    return;
  }

  state.selectedCharacters.splice(index, 1);

  if (state.pendingCharacterIndex === index) {
    state.pendingCharacterIndex = undefined;
  } else if (
    Number.isInteger(state.pendingCharacterIndex) &&
    state.pendingCharacterIndex > index
  ) {
    state.pendingCharacterIndex -= 1;
  }

  if (state.selectedCharacterIndex === index) {
    state.selectedCharacterIndex = undefined;
    state.tempSelectedSpriteIds = {};
    state.selectedSpriteGroupId = undefined;
    return;
  }

  if (
    Number.isInteger(state.selectedCharacterIndex) &&
    state.selectedCharacterIndex > index
  ) {
    state.selectedCharacterIndex -= 1;
  }
};

const retargetAdjacentMoveIndex = (currentIndex, sourceIndex, targetIndex) => {
  if (currentIndex === sourceIndex) {
    return targetIndex;
  }

  if (currentIndex === targetIndex) {
    return sourceIndex;
  }

  return currentIndex;
};

export const moveCharacter = ({ state }, { index, offset } = {}) => {
  const targetIndex = index + Math.sign(offset);
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(targetIndex) ||
    index < 0 ||
    index >= state.selectedCharacters.length ||
    targetIndex < 0 ||
    targetIndex >= state.selectedCharacters.length
  ) {
    return;
  }

  const [character] = state.selectedCharacters.splice(index, 1);
  state.selectedCharacters.splice(targetIndex, 0, character);
  state.selectedCharacterIndex = retargetAdjacentMoveIndex(
    state.selectedCharacterIndex,
    index,
    targetIndex,
  );
  state.pendingCharacterIndex = retargetAdjacentMoveIndex(
    state.pendingCharacterIndex,
    index,
    targetIndex,
  );
};

export const updateCharacterTransform = (
  { state },
  { index, transform } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  character.transformId = transform;
  clearCharacterInlineTransform(character);
};

export const updateCharacterCustomTransformEnabled = (
  { state },
  { index, enabled } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  const customEnabled = enabled === true || enabled === "true";
  if (!customEnabled) {
    clearCharacterInlineTransform(character);
    character.transformId =
      character.transformId ?? getDefaultTransformId(state);
    return;
  }

  const selectedTransform = getSelectedTransformResource(state, character);
  applyCharacterInlineTransform(character, {
    ...normalizeBackgroundTransformEditorTransform(selectedTransform),
    ...character,
  });
};

export const updateCharacterCustomTransform = (
  { state },
  { index, transform } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  character.transformId = character.transformId ?? getDefaultTransformId(state);
  applyCharacterInlineTransform(character, transform);
};

export const updateCharacterAnimation = (
  { state },
  { index, animationId } = {},
) => {
  if (!state.selectedCharacters[index]) {
    return;
  }

  if (!animationId || animationId === "none") {
    state.selectedCharacters[index].animations = undefined;
    state.selectedCharacters[index].animationMode = "none";
    return;
  }

  const selectedAnimationMode = getAnimationModeById(
    state.animations,
    animationId,
  );
  const character = state.selectedCharacters[index];
  character.animationMode = selectedAnimationMode ?? "update";
  character.animations = createAnimationReference({
    animationId,
    animations: state.animations,
    playback: character.animations?.playback,
    animationMode: character.animationMode,
  });
};

export const updateCharacterAnimationPlaybackSpeed = (
  { state },
  { index, speed } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character?.animations) {
    return;
  }

  character.animations.playback.speed = normalizeAnimationPlaybackSpeed(speed);
};

export const updateCharacterAnimationPlaybackLoop = (
  { state },
  { index, loop } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character?.animations) {
    return;
  }

  const canLoop = canLoopAnimationById(
    state.animations,
    character.animations.resourceId,
  );
  character.animations.playback.loop = canLoop
    ? normalizeAnimationPlaybackLoop(loop)
    : false;
};

export const updateCharacterAnimationPlaybackContinuity = (
  { state },
  { index, continuity } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character?.animations) {
    return;
  }

  character.animations.playback.continuity =
    normalizeAnimationPlaybackContinuity(continuity);
};

export const updateCharacterOpacity = ({ state }, { index, opacity } = {}) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  const normalizedOpacity = normalizeCommandLineItemOpacity(opacity);
  if (normalizedOpacity === undefined) {
    delete character.opacity;
    character.opacityOptionEnabled = false;
    return;
  }

  character.opacity = normalizedOpacity;
  character.opacityOptionEnabled = true;
};

export const showCharacterOpacityOption = ({ state }, { index } = {}) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  character.opacityOptionEnabled = true;
  character.opacity =
    normalizeCommandLineItemOpacity(character.opacity) ??
    DEFAULT_COMMAND_LINE_ITEM_OPACITY;
};

export const removeCharacterOpacityOption = ({ state }, { index } = {}) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  character.opacityOptionEnabled = false;
  delete character.opacity;
};

export const selectCharacterOpacityOptionEnabled = (
  { state },
  { index } = {},
) => {
  return state.selectedCharacters[index]?.opacityOptionEnabled === true;
};

export const updateCharacterBlurEnabled = (
  { state },
  { index, enabled } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  character.blurOptionEnabled = true;

  if (!normalizeCommandLineItemBlurEnabled(enabled)) {
    character.blur = null;
    return;
  }

  character.blur = normalizeCommandLineItemBlur(
    character.blur ?? DEFAULT_COMMAND_LINE_ITEM_BLUR,
  );
};

export const showCharacterBlurOption = ({ state }, { index } = {}) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  character.blurOptionEnabled = true;
  character.blur = normalizeCommandLineItemBlur(
    character.blur ?? DEFAULT_COMMAND_LINE_ITEM_BLUR,
  );
};

export const removeCharacterBlurOption = ({ state }, { index } = {}) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  character.blurOptionEnabled = false;
  character.blur = null;
};

export const selectCharacterBlurOptionEnabled = ({ state }, { index } = {}) => {
  return state.selectedCharacters[index]?.blurOptionEnabled === true;
};

export const updateCharacterBlurField = (
  { state },
  { index, fieldName, value } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character) {
    return;
  }

  character.blurOptionEnabled = true;

  character.blur = normalizeCommandLineItemBlurWithField({
    blur: character.blur,
    fieldName,
    value,
  });
};

export const showCharacterFlipOption = (
  { state },
  { index, optionId } = {},
) => {
  const character = state.selectedCharacters[index];
  const option = getCommandLineItemFlipOption(optionId);
  if (!character || !option) {
    return;
  }

  character[option.fieldName] = true;
};

export const removeCharacterFlipOption = (
  { state },
  { index, optionId } = {},
) => {
  const character = state.selectedCharacters[index];
  const option = getCommandLineItemFlipOption(optionId);
  if (!character || !option) {
    return;
  }

  character[option.fieldName] = false;
};

export const selectCharacterFlipOptionEnabled = (
  { state },
  { index, optionId } = {},
) => {
  const option = getCommandLineItemFlipOption(optionId);
  return (
    !!option && state.selectedCharacters[index]?.[option.fieldName] === true
  );
};

export const updateCharacterShaderAdjustment = (
  { state },
  { index, adjustmentId, value } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character || !getCommandLineShaderAdjustment(adjustmentId)) {
    return;
  }

  character.filters = setCommandLineShaderAdjustmentFilter(
    character.filters,
    adjustmentId,
    value,
  );
};

export const showCharacterShaderAdjustmentOption = (
  { state },
  { index, adjustmentId } = {},
) => {
  const character = state.selectedCharacters[index];
  const adjustment = getCommandLineShaderAdjustment(adjustmentId);
  if (!character || !adjustment) {
    return;
  }

  const value =
    getCommandLineShaderAdjustmentValue(character.filters, adjustmentId) ??
    adjustment.defaultValue;
  character.filters = setCommandLineShaderAdjustmentFilter(
    character.filters,
    adjustmentId,
    value,
  );
};

export const removeCharacterShaderAdjustmentOption = (
  { state },
  { index, adjustmentId } = {},
) => {
  const character = state.selectedCharacters[index];
  if (!character || !getCommandLineShaderAdjustment(adjustmentId)) {
    return;
  }

  character.filters = removeCommandLineShaderAdjustmentFilter(
    character.filters,
    adjustmentId,
  );
};

export const selectCharacterShaderAdjustmentOptionEnabled = (
  { state },
  { index, adjustmentId } = {},
) => {
  return (
    getCommandLineShaderAdjustmentValue(
      state.selectedCharacters[index]?.filters,
      adjustmentId,
    ) !== undefined
  );
};

export const updateCharacterSprite = ({ state }, { index, spriteId } = {}) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].sprites = [
      {
        id: DEFAULT_SPRITE_GROUP_ID,
        resourceId: spriteId,
      },
    ];
  }
};

export const updateCharacterSprites = ({ state }, { index, sprites } = {}) => {
  if (!state.selectedCharacters[index]) {
    return;
  }

  state.selectedCharacters[index].sprites = Array.isArray(sprites)
    ? sprites
    : [];
};

export const updateCharacterSpriteName = (
  { state },
  { index, spriteName } = {},
) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].spriteName = spriteName;
  }
};

export const clearCharacters = ({ state }, _payload = {}) => {
  state.selectedCharacters = [];
  state.pendingCharacterIndex = undefined;
  state.pendingCharacterTransformId = undefined;
  state.selectedCharacterIndex = undefined;
  state.tempSelectedSpriteIds = {};
  state.selectedSpriteGroupId = undefined;
};

export const setTempSelectedCharacterId = ({ state }, { characterId } = {}) => {
  state.tempSelectedCharacterId = characterId;
};

export const setTempSelectedSpriteIds = (
  { state },
  { spriteIdsByGroupId } = {},
) => {
  state.tempSelectedSpriteIds = { ...spriteIdsByGroupId };
};

export const clearTempSelectedSpriteIds = ({ state }) => {
  state.tempSelectedSpriteIds = {};
};

export const setTempSelectedSpriteId = (
  { state },
  { groupId, spriteId } = {},
) => {
  const nextGroupId =
    groupId ?? state.selectedSpriteGroupId ?? DEFAULT_SPRITE_GROUP_ID;

  if (!nextGroupId) {
    return;
  }

  if (!spriteId) {
    delete state.tempSelectedSpriteIds[nextGroupId];
    return;
  }

  state.tempSelectedSpriteIds[nextGroupId] = spriteId;
};

export const setSelectedSpriteGroupId = ({ state }, { spriteGroupId } = {}) => {
  state.selectedSpriteGroupId = spriteGroupId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const showFullImagePreview = (
  { state },
  { fileId, kind, atlas, animation, previewKey } = {},
) => {
  if (!fileId) {
    return;
  }

  state.fullImagePreviewVisible = true;
  state.fullImagePreviewKind = kind === "spritesheet" ? "spritesheet" : "image";
  state.fullImagePreviewFileId = fileId;
  state.fullImagePreviewAtlas = atlas;
  state.fullImagePreviewAnimation = animation;
  state.fullImagePreviewKey =
    previewKey ?? `${state.fullImagePreviewKind}:${fileId}`;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewKind = "image";
  state.fullImagePreviewFileId = undefined;
  state.fullImagePreviewAtlas = undefined;
  state.fullImagePreviewAnimation = undefined;
  state.fullImagePreviewKey = undefined;
};

export const setSelectedCharacterIndex = ({ state }, { index } = {}) => {
  state.selectedCharacterIndex = index;
};

export const setPendingCharacterIndex = ({ state }, { index } = {}) => {
  state.pendingCharacterIndex = index;
};

export const clearPendingCharacterIndex = ({ state }) => {
  state.pendingCharacterIndex = undefined;
};

export const setPendingCharacterTransformId = (
  { state },
  { transformId } = {},
) => {
  state.pendingCharacterTransformId = transformId;
};

export const clearPendingCharacterTransformId = ({ state }) => {
  state.pendingCharacterTransformId = undefined;
};

export const selectTempSelectedCharacterId = ({ state }) => {
  return state.tempSelectedCharacterId;
};

export const selectTempSelectedSpriteIds = ({ state }) => {
  return state.tempSelectedSpriteIds;
};

export const selectTempSelectedSpriteId = ({ state }, { groupId } = {}) => {
  const spriteSelectionGroups = getSpriteSelectionGroupsForCharacterIndex({
    state,
    index: state.selectedCharacterIndex,
  });
  const nextGroupId =
    groupId ??
    resolveSelectedSpriteGroupId({
      state,
      spriteSelectionGroups,
    });

  return nextGroupId ? state.tempSelectedSpriteIds?.[nextGroupId] : undefined;
};

export const showDropdownMenu = (
  { state },
  { position, characterIndex } = {},
) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.type = "character-context";
  state.dropdownMenu.characterIndex = characterIndex;
  state.dropdownMenu.items = createCharacterContextDropdownItems(
    characterIndex,
    state.selectedCharacters,
  );
};

export const showAddCharacterTransformDropdownMenu = (
  { state },
  { position } = {},
) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.type = "add-character-transform";
  state.dropdownMenu.characterIndex = null;
  state.dropdownMenu.items = createAddCharacterTransformDropdownItems(
    state.transforms,
  );
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.characterIndex = null;
};

export const selectAddCharacterTransformDropdownItems = ({ state }) => {
  return createAddCharacterTransformDropdownItems(state.transforms);
};

export const selectDropdownMenuType = ({ state }) => {
  return state.dropdownMenu.type;
};

export const selectDropdownMenuCharacterIndex = ({ state }) => {
  return state.dropdownMenu.characterIndex;
};

export const selectSelectedCharacters = ({ state }) => {
  return state.selectedCharacters;
};

export const selectMode = ({ state }) => {
  return state.mode;
};

export const selectSelectedCharacterIndex = ({ state }) => {
  return state.selectedCharacterIndex;
};

export const selectPendingCharacterIndex = ({ state }) => {
  return state.pendingCharacterIndex;
};

export const selectPendingCharacterTransformId = ({ state }) => {
  return state.pendingCharacterTransformId;
};

export const selectSelectedSpriteGroupId = ({ state }) => {
  return resolveSelectedSpriteGroupId({
    state,
    spriteSelectionGroups: getSpriteSelectionGroupsForCharacterIndex({
      state,
      index: state.selectedCharacterIndex,
    }),
  });
};

export const selectSpriteSelectionGroupsForCharacterIndex = (
  { state },
  { index } = {},
) => {
  return getSpriteSelectionGroupsForCharacterIndex({ state, index });
};

export const selectCurrentSpriteSelectionGroups = ({ state }) => {
  return getSpriteSelectionGroupsForCharacterIndex({
    state,
    index: state.selectedCharacterIndex,
  });
};

export const selectCurrentSpriteItemById = ({ state }, { spriteId } = {}) => {
  const characters = selectCharactersWithRepositoryData({ state });
  const character = characters[state.selectedCharacterIndex];
  if (!character?.sprites) {
    return undefined;
  }

  return toFlatItems(character.sprites).find(
    (item) => item.id === spriteId && isCharacterSpriteResourceItem(item),
  );
};

export const setExistingCharacters = ({ state }, { characters } = {}) => {
  state.selectedCharacters = (Array.isArray(characters) ? characters : []).map(
    (character) => normalizeSelectedCharacter(character, state.animations),
  );
};

export const selectCharactersWithRepositoryData = ({ state, copy }) => {
  if (!state.selectedCharacters || !Array.isArray(state.selectedCharacters)) {
    return [];
  }

  return state.selectedCharacters.map((char) => {
    const characterData = getCharacterItemById({
      state,
      characterId: char.id,
    });
    const spriteSelectionGroups = buildSpriteSelectionGroups(characterData);
    const selectedSpriteIdsByGroup = buildTempSelectedSpriteIdsByGroup({
      character: char,
      spriteSelectionGroups,
    });
    const previewSpriteId =
      selectedSpriteIdsByGroup[spriteSelectionGroups[0]?.id] ??
      Object.values(selectedSpriteIdsByGroup)[0];
    const spritePreviewFileIds = buildCharacterSpritePreviewFileIds({
      spritesCollection: characterData?.sprites,
      spriteIds: spriteSelectionGroups.map(
        (spriteSelectionGroup) =>
          selectedSpriteIdsByGroup?.[spriteSelectionGroup.id],
      ),
    });
    const spritePreviewLayers = buildCharacterSpritePreviewLayers({
      spritesCollection: characterData?.sprites,
      spriteIds: spriteSelectionGroups.map(
        (spriteSelectionGroup) =>
          selectedSpriteIdsByGroup?.[spriteSelectionGroup.id],
      ),
    });
    const spriteGroupBoxes = buildSpriteGroupBoxViewData({
      spriteSelectionGroups,
      selectedSpriteIdsByGroup,
      spritesCollection: characterData?.sprites,
      copy,
    });

    if (!characterData) {
      return {
        id: char.id,
        name: "Unknown Character",
        transformId: char.transformId,
        ...getInlineTransformFields(char),
        animations: char.animations,
        animationMode: char.animationMode,
        opacityOptionEnabled: char.opacityOptionEnabled,
        opacity: char.opacity,
        flipX: char.flipX,
        flipY: char.flipY,
        filters: char.filters,
        blurOptionEnabled: char.blurOptionEnabled,
        blur: char.blur,
        spriteGroups: spriteSelectionGroups,
        spriteGroupBoxes,
        showSpriteGroupBoxes: spriteSelectionGroups.length > 1,
        spriteId: previewSpriteId,
        hasSpritePreview: spritePreviewLayers.length > 0,
        spritePreviewFileIds,
        spritePreviewLayers,
        spriteFileId: undefined,
        spriteName: char.spriteName || "",
      };
    }

    let spriteFileId = undefined;
    if (previewSpriteId && characterData.sprites) {
      const sprite = toFlatItems(characterData.sprites).find(
        (s) => s.id === previewSpriteId,
      );
      if (sprite) {
        spriteFileId = sprite.fileId;
      }
    }

    return {
      ...characterData,
      transformId: char.transformId,
      ...getInlineTransformFields(char),
      animations: char.animations,
      animationMode: char.animationMode,
      opacityOptionEnabled: char.opacityOptionEnabled,
      opacity: char.opacity,
      flipX: char.flipX,
      flipY: char.flipY,
      filters: char.filters,
      blurOptionEnabled: char.blurOptionEnabled,
      blur: char.blur,
      spriteGroups: spriteSelectionGroups,
      spriteGroupBoxes,
      showSpriteGroupBoxes: spriteSelectionGroups.length > 1,
      spriteId: previewSpriteId,
      hasSpritePreview: spritePreviewLayers.length > 0,
      spritePreviewFileIds,
      spritePreviewLayers,
      spriteFileId,
      spriteName: char.spriteName || "",
    };
  });
};

const createCharacterFormSlots = (characterIndex) => {
  const prefix = `character-${characterIndex}`;
  return {
    formSectionId: prefix,
    spriteFormSlot: `${prefix}-sprite`,
    spriteSpacerFormSlot: `${prefix}-sprite-spacer`,
    transformModeFormSlot: `${prefix}-transform-mode`,
    predefinedTransformFormSlot: `${prefix}-predefined-transform`,
    transformSpacerFormSlot: `${prefix}-transform-spacer`,
    customTransformFormSlot: `${prefix}-custom-transform`,
    animationFormSlot: `${prefix}-animation`,
    playbackSpeedFormSlot: `${prefix}-playback-speed`,
    playbackContinuityFormSlot: `${prefix}-playback-continuity`,
    playbackLoopFormSlot: `${prefix}-playback-loop`,
    playbackLoopSpacerFormSlot: `${prefix}-playback-loop-spacer`,
    opacityFormSlot: `${prefix}-opacity`,
    blurXFormSlot: `${prefix}-blur-x`,
    blurYFormSlot: `${prefix}-blur-y`,
    blurQualityFormSlot: `${prefix}-blur-quality`,
    blurKernelSizeFormSlot: `${prefix}-blur-kernel-size`,
    blurRepeatEdgePixelsFormSlot: `${prefix}-blur-repeat-edge-pixels`,
    spriteGroupsFormSlot: `${prefix}-sprite-groups`,
  };
};

const createCharactersForm = (characters = []) => ({
  fields: characters.map((character) => {
    const fields = [
      {
        type: "row",
        fields: [
          {
            type: "slot",
            slot: character.spriteFormSlot,
            label: "Sprite",
          },
          {
            type: "slot",
            slot: character.spriteSpacerFormSlot,
          },
        ],
      },
      {
        type: "row",
        fields: [
          {
            type: "slot",
            slot: character.transformModeFormSlot,
            label: "Transform",
          },
          {
            type: "slot",
            slot: character.customTransform
              ? character.transformSpacerFormSlot
              : character.predefinedTransformFormSlot,
            label: character.customTransform
              ? undefined
              : "Predefined Transform",
          },
        ],
      },
    ];

    if (character.customTransform) {
      fields.push({
        type: "slot",
        slot: character.customTransformFormSlot,
      });
    }

    fields.push({
      type: "slot",
      slot: character.animationFormSlot,
      label: "Animation",
    });

    if (character.animationId) {
      fields.push({
        type: "row",
        fields: [
          {
            type: "slot",
            slot: character.playbackSpeedFormSlot,
            label: "Playback Speed",
          },
          {
            type: "slot",
            slot: character.playbackContinuityFormSlot,
            label: "Continuity",
          },
        ],
      });
    }

    if (character.animationId && character.animationMode === "update") {
      fields.push({
        type: "row",
        fields: [
          {
            type: "slot",
            slot: character.playbackLoopFormSlot,
            label: "Loop",
          },
          {
            type: "slot",
            slot: character.playbackLoopSpacerFormSlot,
          },
        ],
      });
    }

    if (character.opacityOptionEnabled) {
      fields.push({
        type: "slot",
        slot: character.opacityFormSlot,
      });
    }

    if (character.blurOptionEnabled) {
      fields.push({
        type: "section",
        id: `${character.formSectionId}-blur`,
        label: "Blur",
        separator: false,
        action: {
          id: "remove",
          icon: "x",
          label: "Remove",
        },
        fields: [
          {
            type: "row",
            fields: [
              {
                type: "slot",
                slot: character.blurXFormSlot,
                label: "Blur X",
              },
              {
                type: "slot",
                slot: character.blurYFormSlot,
                label: "Blur Y",
              },
            ],
          },
          {
            type: "row",
            fields: [
              {
                type: "slot",
                slot: character.blurQualityFormSlot,
                label: "Quality",
              },
              {
                type: "slot",
                slot: character.blurKernelSizeFormSlot,
                label: "Kernel Size",
              },
            ],
          },
          {
            type: "slot",
            slot: character.blurRepeatEdgePixelsFormSlot,
            label: "Repeat Edge Pixels",
          },
        ],
      });
    }

    for (const flipOption of character.flipOptions) {
      if (!flipOption.enabled) {
        continue;
      }

      fields.push({
        type: "section",
        id: `${character.formSectionId}-${flipOption.id}`,
        label: flipOption.label,
        separator: false,
        action: {
          id: "remove",
          icon: "x",
          label: "Remove",
        },
        fields: [],
      });
    }

    for (const adjustment of character.shaderAdjustments) {
      if (!adjustment.enabled) {
        continue;
      }

      fields.push({
        type: "section",
        id: `${character.formSectionId}-${adjustment.id}`,
        label: adjustment.label,
        separator: false,
        action: {
          id: "remove",
          icon: "x",
          label: "Remove",
        },
        fields: [
          {
            type: "slot",
            slot: adjustment.formSlot,
          },
        ],
      });
    }

    if (character.showSpriteGroupBoxes) {
      fields.push({
        type: "slot",
        slot: character.spriteGroupsFormSlot,
        label: "Sprite Groups",
      });
    }

    return {
      type: "section",
      id: character.formSectionId,
      label: character.displayName,
      action:
        character.opacityOptionEnabled &&
        character.blurOptionEnabled &&
        character.flipOptions.every((option) => option.enabled) &&
        character.shaderAdjustments.every((adjustment) => adjustment.enabled)
          ? undefined
          : {
              id: "add",
              icon: "plus",
              label: "Add option",
            },
      fields,
    };
  }),
});

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const resourceSelectorLayout = createCommandLineResourceSelectorLayout({
    isTouchMode: state.isTouchMode,
  });
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  const buildSelectableTreeData = ({
    collection,
    selectedItemId,
    syntheticRootId,
    itemFilter = () => true,
    itemViewMapper = (item) => item,
    hideEmptyGroups = false,
  } = {}) => {
    const ungroupedGroupLabel = localizeCommandLineText(
      UNGROUPED_GROUP_LABEL,
      copy,
    );
    const allItems = toFlatItems(collection);
    const filterVisibleItem = (item) => itemFilter(item) && matchesSearch(item);
    const rootChildren = allItems.filter(
      (item) => item.type !== "folder" && item.parentId === null,
    );
    const visibleRootChildren = rootChildren
      .filter(filterVisibleItem)
      .map((child) => {
        const isSelected = child.id === selectedItemId;
        return {
          ...itemViewMapper(child),
          itemBorderColor: isSelected ? "pr" : "bo",
          itemHoverBorderColor: isSelected ? "pr" : "ac",
        };
      });

    const groups = toFlatGroups(collection)
      .map((group) => {
        const children = group.children
          .filter(filterVisibleItem)
          .map((child) => {
            const isSelected = child.id === selectedItemId;
            return {
              ...itemViewMapper(child),
              itemBorderColor: isSelected ? "pr" : "bo",
              itemHoverBorderColor: isSelected ? "pr" : "ac",
            };
          });

        return {
          ...group,
          children,
          hasChildren: children.length > 0,
          shouldDisplay:
            children.length > 0 || (!hideEmptyGroups && !searchQuery),
        };
      })
      .filter((group) => group.shouldDisplay);

    const visibleGroupIds = new Set(groups.map((group) => group.id));
    const explorerItems = allItems.filter(
      (item) =>
        item.type === "folder" &&
        (!hideEmptyGroups || visibleGroupIds.has(item.id)),
    );

    if (
      hideEmptyGroups ? visibleRootChildren.length > 0 : rootChildren.length > 0
    ) {
      explorerItems.unshift({
        id: syntheticRootId,
        type: "folder",
        name: ungroupedGroupLabel,
        fullLabel: ungroupedGroupLabel,
        _level: 0,
        parentId: null,
        hasChildren: true,
      });
    }

    if (visibleRootChildren.length > 0) {
      groups.unshift({
        id: syntheticRootId,
        type: "folder",
        name: ungroupedGroupLabel,
        fullLabel: ungroupedGroupLabel,
        _level: 0,
        parentId: null,
        hasChildren: true,
        children: visibleRootChildren,
        shouldDisplay: true,
      });
    }

    return {
      explorerItems,
      groups,
    };
  };

  const characterTreeData = buildSelectableTreeData({
    collection: state.items,
    selectedItemId: state.tempSelectedCharacterId,
    syntheticRootId: UNGROUPED_CHARACTER_GROUP_ID,
  });

  // Initialize sprite data (will be populated later after processedSelectedCharacters is defined)
  let spriteItems = [];
  let spriteGroups = [];
  let selectedCharacterName = "";
  let spriteSelectionTabs = [];
  let selectedSpriteGroupId = undefined;
  let selectedSpriteGroupName = "";

  // Get transform options from repository instead of hardcoded values
  const transformItems = getTransformItems(state);
  const transformOptions = transformItems.map((transform) => ({
    label: transform.name,
    value: transform.id,
  }));
  const animationItems = toFlatItems(state.animations).filter(
    (item) => item.type === "animation",
  );
  const animationOptions = animationItems.map((item) => ({
    value: item.id,
    label: item.name,
    suffixText:
      getAnimationType(item) === "transition"
        ? localizeCommandLineText("Transition", copy)
        : localizeCommandLineText("Update", copy),
  }));

  // Get enriched character data
  const enrichedCharacters = selectCharactersWithRepositoryData({
    state,
    copy,
  });
  const processedSelectedCharacters = enrichedCharacters.map((character) => ({
    ...character,
    displayName:
      character.name === "Unknown Character"
        ? localizeCommandLineText("Unknown Character", copy)
        : character.name || localizeCommandLineText("Unnamed Character", copy),
    animationMode:
      character.animationMode ??
      getAnimationModeById(
        state.animations,
        character.animations?.resourceId,
      ) ??
      "none",
  }));

  // Get sprite data for the selected character (after processedSelectedCharacters is defined)
  if (
    state.mode === "sprite-select" &&
    state.selectedCharacterIndex !== undefined
  ) {
    const enrichedSelectedChar =
      processedSelectedCharacters[state.selectedCharacterIndex];
    const currentSpriteSelectionGroups =
      getSpriteSelectionGroupsForCharacterIndex({
        state,
        index: state.selectedCharacterIndex,
      });
    const spriteSelectionTabGroups = orderSpriteSelectionGroupsTopFirst(
      currentSpriteSelectionGroups,
    );

    spriteSelectionTabs = spriteSelectionTabGroups.map(
      (spriteSelectionGroup) => ({
        id: spriteSelectionGroup.id,
        label: spriteSelectionGroup.name,
      }),
    );
    selectedSpriteGroupId = resolveSelectedSpriteGroupId({
      state,
      spriteSelectionGroups: currentSpriteSelectionGroups,
    });
    selectedSpriteGroupName =
      currentSpriteSelectionGroups.find(
        (spriteSelectionGroup) =>
          spriteSelectionGroup.id === selectedSpriteGroupId,
      )?.name ?? "";
    const selectedSpriteGroupTags =
      currentSpriteSelectionGroups.find(
        (spriteSelectionGroup) =>
          spriteSelectionGroup.id === selectedSpriteGroupId,
      )?.tags ?? [];
    const selectedSpriteId =
      selectedSpriteGroupId &&
      state.tempSelectedSpriteIds?.[selectedSpriteGroupId];

    if (enrichedSelectedChar && enrichedSelectedChar.sprites) {
      selectedCharacterName =
        enrichedSelectedChar.name || localizeCommandLineText("Character", copy);
      const spriteTreeData = buildSelectableTreeData({
        collection: enrichedSelectedChar.sprites,
        selectedItemId: selectedSpriteId,
        syntheticRootId: UNGROUPED_SPRITE_GROUP_ID,
        itemFilter: (item) =>
          isCharacterSpriteResourceItem(item) &&
          matchesSpriteGroupTags({
            item,
            tagIds: selectedSpriteGroupTags,
          }),
        itemViewMapper: buildSpritePreviewItemViewData,
        hideEmptyGroups: selectedSpriteGroupTags.length > 0,
      });
      spriteItems = spriteTreeData.explorerItems;
      spriteGroups = spriteTreeData.groups;
    }
  }

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
  ];

  if (state.mode === "character-select") {
    breadcrumb.push({
      id: "current",
      label: "Characters",
      click: true,
    });
    breadcrumb.push({
      label: "Select",
    });
  } else if (state.mode === "sprite-select") {
    breadcrumb.push({
      id: "current",
      label: "Characters",
      click: true,
    });
    breadcrumb.push({
      id: "character-select",
      label:
        selectedCharacterName || localizeCommandLineText("Character", copy),
      click: true,
    });
    breadcrumb.push({
      label: "Sprite Selection",
    });
  } else {
    breadcrumb.push({
      label: "Characters",
    });
  }

  const characterControls = processedSelectedCharacters.map(
    (char, characterIndex) => {
      const animationCanLoop = canLoopAnimationById(
        state.animations,
        char.animations?.resourceId,
      );

      return {
        ...char,
        characterIndex,
        // Ensure transformId is set, use first transform as fallback if needed
        transformId:
          char.transformId ||
          (transformOptions.length > 0 ? transformOptions[0].value : undefined),
        customTransform: hasInlineTransform(char),
        customTransformDetails: createCustomTransformDetails(char).map(
          (item) => ({
            ...item,
            label: localizeCommandLineText(item.label, copy),
          }),
        ),
        animationId: char.animations?.resourceId,
        animationPlaybackSpeed: normalizeAnimationPlaybackSpeed(
          char.animations?.playback?.speed,
        ),
        animationPlaybackLoop: normalizeAnimationPlaybackLoop(
          char.animations?.playback?.loop,
        ),
        animationPlaybackContinuity: normalizeAnimationPlaybackContinuity(
          char.animations?.playback?.continuity,
        ),
        animationCanLoop,
        animationLoopDisabled: !animationCanLoop,
        opacityOptionEnabled: char.opacityOptionEnabled === true,
        opacity: char.opacity ?? DEFAULT_COMMAND_LINE_ITEM_OPACITY,
        blurOptionEnabled: char.blurOptionEnabled === true,
        blurEnabled: Boolean(char.blur),
        blur: normalizeCommandLineItemBlur(
          char.blur ?? DEFAULT_COMMAND_LINE_ITEM_BLUR,
        ),
        flipOptions: COMMAND_LINE_ITEM_FLIP_OPTIONS.map((option) => ({
          ...option,
          enabled: char[option.fieldName] === true,
        })),
        shaderAdjustments: createCommandLineShaderAdjustmentControls(
          char.filters,
        ),
      };
    },
  );

  // Create default values with character data and options
  const displayedCharacters = characterControls
    .slice()
    .reverse()
    .map((character) => {
      const formSlots = createCharacterFormSlots(character.characterIndex);

      return {
        ...character,
        ...formSlots,
        shaderAdjustments: character.shaderAdjustments.map((adjustment) => ({
          ...adjustment,
          formSlot: `${formSlots.formSectionId}-${adjustment.id}`,
        })),
      };
    });
  const defaultValues = {
    characters: displayedCharacters,
    transformOptions,
    animationOptions,
    animationPlaybackLoopOptions: localizeCommandLineOptions(
      ANIMATION_PLAYBACK_LOOP_OPTIONS,
      copy,
    ),
    animationPlaybackContinuityOptions: localizeCommandLineOptions(
      ANIMATION_PLAYBACK_CONTINUITY_OPTIONS,
      copy,
    ),
    transformModeOptions: localizeCommandLineOptions(
      TRANSFORM_MODE_OPTIONS,
      copy,
    ),
    blurKernelSizeOptions: localizeCommandLineOptions(
      COMMAND_LINE_ITEM_BLUR_KERNEL_SIZE_SELECT_OPTIONS,
      copy,
    ),
    blurRepeatEdgeOptions: localizeCommandLineOptions(
      COMMAND_LINE_ITEM_BLUR_REPEAT_EDGE_OPTIONS,
      copy,
    ),
  };

  return {
    mode: state.mode,
    items: characterTreeData.explorerItems,
    groups: characterTreeData.groups,
    showResourceSelectorFileExplorer: resourceSelectorLayout.showFileExplorer,
    resourceSelectorGridStyle: resourceSelectorLayout.gridStyle,
    resourceSelectorItemStyle: resourceSelectorLayout.itemStyle,
    resourceSelectorCardStyle: resourceSelectorLayout.cardStyle,
    characterSelectorPreviewStyle: state.isTouchMode
      ? "width: 100%; height: auto; aspect-ratio: 5 / 3;"
      : "width: 200px; height: 120px;",
    selectedCharacters: processedSelectedCharacters,
    transformOptions,
    animationOptions,
    spriteItems,
    spriteGroups,
    showSpriteGroupTabs: spriteSelectionTabs.length > 1,
    spriteSelectionTabs,
    selectedSpriteGroupId,
    selectedSpriteGroupName,
    selectedCharacterName,
    searchQuery: state.searchQuery,
    searchPlaceholder: localizeCommandLineText("Search...", copy),
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewKind: state.fullImagePreviewKind,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    fullImagePreviewAtlas: state.fullImagePreviewAtlas,
    fullImagePreviewAnimation: state.fullImagePreviewAnimation,
    fullImagePreviewKey: state.fullImagePreviewKey,
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    form: localizeCommandLineForm(
      createCharactersForm(displayedCharacters),
      copy,
    ),
    formKey:
      displayedCharacters
        .map((character) =>
          [
            character.characterIndex,
            character.id,
            character.displayName,
            character.customTransform ? "custom-transform" : "preset-transform",
            character.animationId ?? "no-animation",
            character.animationMode,
            character.opacityOptionEnabled ? "opacity" : "no-opacity",
            character.blurOptionEnabled ? "blur-option" : "no-blur-option",
            character.blurEnabled ? "blur" : "no-blur",
            ...character.flipOptions
              .filter((option) => option.enabled)
              .map((option) => option.id),
            ...character.shaderAdjustments
              .filter((adjustment) => adjustment.enabled)
              .map((adjustment) => adjustment.id),
            character.showSpriteGroupBoxes ? "sprite-groups" : "no-groups",
          ].join(":"),
        )
        .join("|") || "no-characters",
    defaultValues,
    dropdownMenu: localizeCommandLineDropdownMenu(state.dropdownMenu, copy),
    noAvatarLabel: localizeCommandLineText("No Avatar", copy),
    noPreviewLabel: localizeCommandLineText("No preview", copy),
    noSpriteLabel: localizeCommandLineText("No Sprite", copy),
    opacityLabel: localizeCommandLineText("Opacity", copy),
    removeOpacityLabel: localizeCommandLineText("Remove Opacity", copy),
    selectAnimationPlaceholder: localizeCommandLineText(
      "Select animation",
      copy,
    ),
    addCharacterButtonLabel: localizeCommandLineText("+ Add Character", copy),
    submitButtonLabel: localizeCommandLineText("Submit", copy),
    selectButtonLabel: localizeCommandLineText("Select", copy),
    transformEditorTitle: localizeCommandLineText("Transform", copy),
    doneButtonLabel: localizeCommandLineText("Done", copy),
  };
};
