import {
  buildCharacterSpritePreviewLayer,
  isCharacterSpriteResourceItem,
} from "../../internal/characterSpritePreview.js";
import {
  buildCharacterSpritesFromGroups,
  buildDefaultCharacterSprites,
  buildSpriteIdsByGroup,
  buildSpriteSelectionGroups,
  matchesSpriteGroupTags,
  orderSpriteSelectionGroupsTopFirst,
} from "../../internal/characterSpriteSelection.js";
import { selectI18nCopy } from "../../internal/ui/i18nCopy.js";
import { isTouchUiConfig } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { buildSelectableResourceTree } from "../../internal/ui/resourcePages/selectableResourceTree.js";
import { selectResourceSelectorEmptyMessage } from "../../internal/ui/resourcePages/selectorEmptyState.js";
import { createCommandLineResourceSelectorLayout } from "../../internal/ui/sceneEditor/commandLineResourceSelectorLayout.js";

const UNGROUPED_CHARACTERS_ID = "__ungrouped_characters__";
const UNGROUPED_SPRITES_ID = "__ungrouped_sprites__";

// Picks a character, then one sprite for each of its sprite groups, in the
// scene editor's character picker design.
export const createInitialState = () => ({
  isTouchMode: false,
  charactersData: { items: {}, tree: [] },
  // "characters" lists the characters; "sprites" picks the chosen one's
  // sprites.
  step: "characters",
  characterId: undefined,
  spriteIdsByGroup: {},
  selectedGroupId: undefined,
  searchQuery: "",
});

const getCharacter = (state, characterId) => {
  const item = state.charactersData.items[characterId];
  return item?.type === "character" ? item : undefined;
};

const selectSpriteGroups = (state) =>
  buildSpriteSelectionGroups(getCharacter(state, state.characterId));

// The tabs list the groups top first, so the top group is picked first.
const selectCurrentSpriteGroup = (state) => {
  const spriteGroups = selectSpriteGroups(state);
  return (
    spriteGroups.find((group) => group.id === state.selectedGroupId) ??
    spriteGroups.at(-1)
  );
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode = isTouchUiConfig(uiConfig);
};

// Opens on the given character's sprites, or on the characters.
export const loadSelection = (
  { state },
  { charactersData, characterId, sprites } = {},
) => {
  state.charactersData = charactersData;
  const character = getCharacter(state, characterId);
  state.characterId = character?.id;
  state.spriteIdsByGroup = character ? buildSpriteIdsByGroup(sprites) : {};
  state.step = character ? "sprites" : "characters";
  state.selectedGroupId = undefined;
  state.searchQuery = "";
};

export const selectStep = ({ state }) => state.step;

// Another character starts with its default sprites; the same one keeps the
// sprites picked for it.
export const pickCharacter = ({ state }, { characterId } = {}) => {
  const character = getCharacter(state, characterId);
  if (!character) {
    return;
  }

  if (character.id !== state.characterId) {
    state.characterId = character.id;
    state.spriteIdsByGroup = buildSpriteIdsByGroup(
      buildDefaultCharacterSprites({ characterData: character }),
    );
    state.selectedGroupId = undefined;
  }
  state.step = "sprites";
  state.searchQuery = "";
};

export const showCharacters = ({ state }) => {
  state.step = "characters";
  state.searchQuery = "";
};

export const setSelectedGroupId = ({ state }, { groupId } = {}) => {
  state.selectedGroupId = groupId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value;
};

export const pickSprite = ({ state }, { spriteId } = {}) => {
  state.spriteIdsByGroup[selectCurrentSpriteGroup(state).id] = spriteId;
};

// The pick in its saved shape, once a character has a sprite.
export const selectSelection = ({ state }) => {
  const character = getCharacter(state, state.characterId);
  if (!character) {
    return undefined;
  }

  const sprites = buildCharacterSpritesFromGroups({
    spriteSelectionGroups: selectSpriteGroups(state),
    spriteIdsByGroup: state.spriteIdsByGroup,
  });
  return sprites.length > 0
    ? { characterId: character.id, sprites }
    : undefined;
};

// A character card shows its avatar.
const createCharacterItemView = (copy) => (item) => ({
  id: item.id,
  name: item.name,
  previewKind: item.fileId ? "image" : undefined,
  previewFileId: item.fileId,
  emptyPreviewLabel: copy.noAvatarLabel,
});

// A sprite card shows the sprite, a spritesheet as its first animation.
const createSpriteItemView = (copy) => (item) => {
  const previewLayer = buildCharacterSpritePreviewLayer(item);
  return {
    id: item.id,
    name: item.name,
    previewKind: previewLayer?.kind,
    previewFileId: previewLayer?.fileId,
    previewAtlas: previewLayer?.atlas,
    previewAnimation: previewLayer?.animation,
    previewKey: previewLayer?.previewKey,
    emptyPreviewLabel: copy.noPreviewLabel,
  };
};

const selectResourceTree = (state, copy, searchQuery) => {
  if (state.step === "characters") {
    return buildSelectableResourceTree({
      collection: state.charactersData,
      selectedItemId: state.characterId,
      syntheticRootId: UNGROUPED_CHARACTERS_ID,
      ungroupedLabel: copy.ungroupedLabel,
      searchQuery,
      itemFilter: (item) => item.type === "character",
      itemViewMapper: createCharacterItemView(copy),
    });
  }

  // A group with tags lists only its sprites.
  const spriteGroup = selectCurrentSpriteGroup(state);
  return buildSelectableResourceTree({
    collection: getCharacter(state, state.characterId).sprites,
    selectedItemId: state.spriteIdsByGroup[spriteGroup.id],
    syntheticRootId: UNGROUPED_SPRITES_ID,
    ungroupedLabel: copy.ungroupedLabel,
    searchQuery,
    itemFilter: (item) =>
      isCharacterSpriteResourceItem(item) &&
      matchesSpriteGroupTags({ item, tagIds: spriteGroup.tags }),
    itemViewMapper: createSpriteItemView(copy),
    hideEmptyGroups: spriteGroup.tags.length > 0,
  });
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectI18nCopy(i18n, [
    "resourcePages",
    "characterSpriteSelector",
  ]);
  const layout = createCommandLineResourceSelectorLayout({
    isTouchMode: state.isTouchMode,
  });
  const searchQuery = state.searchQuery.toLowerCase().trim();
  const character = getCharacter(state, state.characterId);
  const hasSpriteGroups = character?.spriteGroups?.length > 0;
  const currentSpriteGroup = selectCurrentSpriteGroup(state);
  const resourceTree = selectResourceTree(state, copy, searchQuery);

  return {
    step: state.step,
    characterName: character?.name ?? "",
    charactersLabel: copy.charactersLabel,
    showGroupTabs: hasSpriteGroups && character.spriteGroups.length > 1,
    groupTabs: orderSpriteSelectionGroupsTopFirst(
      selectSpriteGroups(state),
    ).map((group) => ({
      id: group.id,
      label: hasSpriteGroups ? group.name : copy.defaultSpriteGroupName,
    })),
    selectedGroupId: currentSpriteGroup?.id,
    searchQuery: state.searchQuery,
    searchPlaceholder: copy.searchPlaceholder,
    showFileExplorer: layout.showFileExplorer,
    explorerItems: resourceTree.explorerItems,
    groups: resourceTree.groups,
    emptyMessage: selectResourceSelectorEmptyMessage({
      groups: resourceTree.groups,
      searchQuery,
      i18n,
    }),
    gridStyle: layout.gridStyle,
    itemStyle: layout.itemStyle,
    cardStyle: layout.cardStyle,
    previewStyle: state.isTouchMode
      ? "width: 100%; height: auto; aspect-ratio: 5 / 3;"
      : "width: 200px; height: 120px;",
  };
};
