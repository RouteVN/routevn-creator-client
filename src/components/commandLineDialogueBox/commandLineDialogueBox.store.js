import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import {
  buildCharacterSpritePreviewLayer,
  buildCharacterSpritePreviewFileIds,
  buildCharacterSpritePreviewLayers,
  isCharacterSpriteResourceItem,
} from "../../internal/characterSpritePreview.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  localizeCommandLineOptions,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const ANIMATION_MODE_OPTIONS = [
  {
    label: "None",
    value: "none",
  },
  {
    label: "Update",
    value: "update",
  },
  {
    label: "Transition",
    value: "transition",
  },
];

const DEFAULT_TEXT_SPEED = 75;
const DEFAULT_SPRITE_GROUP_ID = "base";
const DEFAULT_SPRITE_GROUP_NAME = "Sprite";
const SPEAKER_SPRITE_LABEL = "Speaker sprite";
const SPEAKER_SPRITE_TOOLTIP =
  "Speaker's face that appears on top of the dialogue box. For body sprites use the Characters action";
const UNGROUPED_CHARACTER_GROUP_ID = "__ungrouped_dialogue_characters__";
const UNGROUPED_SPRITE_GROUP_ID = "__ungrouped_dialogue_sprites__";
const UNGROUPED_GROUP_LABEL = "Ungrouped";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const toCharacterCollection = ({ characters = [], tree } = {}) => {
  const items = {};

  for (const character of characters ?? []) {
    if (!character?.id) {
      continue;
    }

    items[character.id] = character;
  }

  return {
    items,
    tree: Array.isArray(tree) ? tree : undefined,
  };
};

const getAnimationType = (item = {}) => {
  return item?.animation?.type === "transition" ? "transition" : "update";
};

const getLayoutTypeByMode = (mode) => {
  return mode === "nvl" ? "dialogue-nvl" : "dialogue-adv";
};

const getLayoutOptions = ({ layouts, mode } = {}) => {
  const layoutType = getLayoutTypeByMode(mode);
  return (layouts ?? [])
    .filter((layout) => layout.layoutType === layoutType)
    .map((layout) => ({
      value: layout.id,
      label: layout.name,
    }));
};

const resolveSelectedResourceId = ({ layoutOptions, resourceId } = {}) => {
  if (
    resourceId &&
    layoutOptions.some((layoutOption) => layoutOption.value === resourceId)
  ) {
    return resourceId;
  }

  return layoutOptions[0]?.value ?? "";
};

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

const matchesSpriteGroupTags = ({ item, tagIds } = {}) => {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    return true;
  }

  const itemTagIds = Array.isArray(item?.tagIds) ? item.tagIds : [];
  return tagIds.some((tagId) => itemTagIds.includes(tagId));
};

const getCharacterById = ({ characters, characterId } = {}) => {
  if (!characterId) {
    return undefined;
  }

  return (characters ?? []).find((character) => character.id === characterId);
};

const resolveSelectedOptionValue = ({ options, value } = {}) => {
  if (value && options.some((option) => option.value === value)) {
    return value;
  }

  return "";
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

  return (spriteSelectionGroups ?? []).map((spriteSelectionGroup) => {
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
  });
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

const buildSelectableTreeData = ({
  collection,
  selectedItemId,
  syntheticRootId,
  itemFilter = () => true,
  itemViewMapper = (item) => item,
  hideEmptyGroups = false,
  searchQuery = "",
  copy,
} = {}) => {
  const ungroupedGroupLabel = localizeCommandLineText(
    UNGROUPED_GROUP_LABEL,
    copy,
  );
  const normalizedSearchQuery = searchQuery.toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!normalizedSearchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return (
      name.includes(normalizedSearchQuery) ||
      description.includes(normalizedSearchQuery)
    );
  };
  const allItems = toFlatItems(collection);
  const filterVisibleItem = (item) =>
    itemFilter(item) && matchesSearch(item) && item.type !== "folder";
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
      const children = group.children.filter(filterVisibleItem).map((child) => {
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
          children.length > 0 || (!hideEmptyGroups && !normalizedSearchQuery),
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

export const createInitialState = () => ({
  mode: "current",
  layouts: [],
  selectedResourceId: "",
  characters: [],
  selectedCharacterId: "",
  customCharacterName: false,
  characterName: "",
  characterSpriteEnabled: false,
  spriteCharacterId: "",
  spriteTransformId: "",
  spriteAnimationMode: "none",
  spriteAnimationId: "",
  selectedSpriteIds: {},
  tempSelectedSpriteIds: {},
  selectedSpriteGroupId: undefined,
  selectedMode: "adv",
  appendDialogue: false,
  persistCharacter: false,
  clearPage: false,
  customizeTextSpeed: false,
  textSpeed: DEFAULT_TEXT_SPEED,
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewKind: "image",
  fullImagePreviewFileId: undefined,
  fullImagePreviewAtlas: undefined,
  fullImagePreviewAnimation: undefined,
  fullImagePreviewKey: undefined,
  speakerSpriteTooltip: {
    open: false,
    x: 0,
    y: 0,
  },

  defaultValues: {
    mode: "adv",
    resourceId: "",
    characterId: "",
    customCharacterName: false,
    characterName: "",
    append: false,
    persistCharacter: false,
    clearPage: false,
    customizeTextSpeed: false,
    textSpeed: DEFAULT_TEXT_SPEED,
  },

  form: {
    fields: [
      {
        name: "mode",
        type: "segmented-control",
        label: "Mode",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: "adv", label: "ADV" },
          { value: "nvl", label: "NVL" },
        ],
      },
      {
        name: "resourceId",
        type: "select",
        label: "Layout",
        description: "",
        required: true,
        clearable: false,
        placeholder: "Choose a layout...",
        options: [],
      },
      {
        name: "characterId",
        type: "select",
        label: "Speaker",
        description: "",
        required: false,
        placeholder: "Choose a speaker...",
        options: [],
      },
      {
        name: "customCharacterName",
        type: "segmented-control",
        label: "Custom Speaker Name",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        $when: "values.customCharacterName == true",
        name: "characterName",
        type: "input-text",
        label: "Speaker Name",
        description: "",
        required: true,
        placeholder: "Enter speaker name",
      },
      {
        type: "slot",
        slot: "characterSprite",
      },
      {
        name: "customizeTextSpeed",
        type: "segmented-control",
        label: "Customize Text Speed",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        $when: "values.customizeTextSpeed == true",
        name: "textSpeed",
        type: "slider-with-input",
        label: "Text Speed",
        description: "",
        required: true,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        $when: 'values.mode == "adv"',
        name: "append",
        type: "segmented-control",
        label: "Append",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        $when: "values.characterId || values.customCharacterName",
        name: "persistCharacter",
        type: "segmented-control",
        label: "Persist Speaker",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        $when: 'values.mode == "nvl"',
        name: "clearPage",
        type: "segmented-control",
        label: "Clear Page",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
    ],
    actions: {
      layout: "",
      buttons: [],
    },
  },
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setLayouts = ({ state }, { layouts } = {}) => {
  state.layouts = layouts;
};

export const setSelectedResource = ({ state }, { resourceId } = {}) => {
  state.selectedResourceId = resourceId;
  state.defaultValues.resourceId = resourceId;
};

export const setSelectedCharacterId = ({ state }, { characterId } = {}) => {
  state.selectedCharacterId = characterId ?? "";
  state.defaultValues.characterId = characterId ?? "";
};

export const setCustomCharacterName = (
  { state },
  { customCharacterName } = {},
) => {
  const customCharacterNameValue = toBoolean(customCharacterName);
  state.customCharacterName = customCharacterNameValue;
  state.defaultValues.customCharacterName = customCharacterNameValue;
};

export const setCharacterName = ({ state }, { characterName } = {}) => {
  const nextCharacterName = characterName ?? "";
  state.characterName = nextCharacterName;
  state.defaultValues.characterName = nextCharacterName;
};

export const setCharacterSpriteEnabled = (
  { state },
  { characterSpriteEnabled } = {},
) => {
  state.characterSpriteEnabled = toBoolean(characterSpriteEnabled);
};

export const setSpriteCharacterId = ({ state }, { characterId } = {}) => {
  state.spriteCharacterId = characterId ?? "";

  if (!state.spriteCharacterId) {
    state.characterSpriteEnabled = false;
    state.selectedSpriteIds = {};
    state.tempSelectedSpriteIds = {};
    state.selectedSpriteGroupId = undefined;
  }
};

export const setSpriteTransformId = ({ state }, { transformId } = {}) => {
  state.spriteTransformId = transformId ?? "";
};

export const setSpriteAnimationMode = ({ state }, { mode } = {}) => {
  const nextMode = mode === "update" || mode === "transition" ? mode : "none";
  const previousMode = state.spriteAnimationMode ?? "none";
  state.spriteAnimationMode = nextMode;

  if (nextMode !== previousMode) {
    state.spriteAnimationId = "";
  }
};

export const setSpriteAnimationId = ({ state }, { animationId } = {}) => {
  state.spriteAnimationId = animationId ?? "";
};

export const setSelectedSpriteIds = (
  { state },
  { spriteIdsByGroupId } = {},
) => {
  state.selectedSpriteIds = {};

  for (const [spriteGroupId, spriteId] of Object.entries(
    spriteIdsByGroupId ?? {},
  )) {
    if (spriteId) {
      state.selectedSpriteIds[spriteGroupId] = spriteId;
    }
  }

  state.characterSpriteEnabled =
    !!state.spriteCharacterId &&
    Object.keys(state.selectedSpriteIds).length > 0;
};

export const setTempSelectedSpriteIds = (
  { state },
  { spriteIdsByGroupId } = {},
) => {
  state.tempSelectedSpriteIds = {};

  for (const [spriteGroupId, spriteId] of Object.entries(
    spriteIdsByGroupId ?? {},
  )) {
    if (spriteId) {
      state.tempSelectedSpriteIds[spriteGroupId] = spriteId;
    }
  }
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

export const clearCharacterSprite = ({ state }) => {
  state.characterSpriteEnabled = false;
  state.spriteCharacterId = "";
  state.spriteTransformId = "";
  state.spriteAnimationMode = "none";
  state.spriteAnimationId = "";
  state.selectedSpriteIds = {};
  state.tempSelectedSpriteIds = {};
  state.selectedSpriteGroupId = undefined;
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

export const hideFullImagePreview = ({ state }) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewKind = "image";
  state.fullImagePreviewFileId = undefined;
  state.fullImagePreviewAtlas = undefined;
  state.fullImagePreviewAnimation = undefined;
  state.fullImagePreviewKey = undefined;
};

export const showSpeakerSpriteTooltip = ({ state }, { x, y } = {}) => {
  state.speakerSpriteTooltip.open = true;
  state.speakerSpriteTooltip.x = x;
  state.speakerSpriteTooltip.y = y;
};

export const hideSpeakerSpriteTooltip = ({ state }) => {
  state.speakerSpriteTooltip.open = false;
};

export const setSelectedMode = ({ state }, { mode } = {}) => {
  const selectedMode = mode === "nvl" ? "nvl" : "adv";
  state.selectedMode = selectedMode;
  state.defaultValues.mode = selectedMode;
};

export const setAppendDialogue = ({ state }, { append } = {}) => {
  const appendValue = toBoolean(append);
  state.appendDialogue = appendValue;
  state.defaultValues.append = appendValue;
};

export const setPersistCharacter = ({ state }, { persistCharacter } = {}) => {
  const persistCharacterValue = toBoolean(persistCharacter);
  state.persistCharacter = persistCharacterValue;
  state.defaultValues.persistCharacter = persistCharacterValue;
};

export const setClearPage = ({ state }, { clearPage } = {}) => {
  const clearPageValue = toBoolean(clearPage);
  state.clearPage = clearPageValue;
  state.defaultValues.clearPage = clearPageValue;
};

export const setCustomizeTextSpeed = (
  { state },
  { customizeTextSpeed } = {},
) => {
  const customizeTextSpeedValue = toBoolean(customizeTextSpeed);
  state.customizeTextSpeed = customizeTextSpeedValue;
  state.defaultValues.customizeTextSpeed = customizeTextSpeedValue;
};

export const setTextSpeed = (
  { state },
  { textSpeed, fallback = state.textSpeed } = {},
) => {
  const nextTextSpeed = normalizeTextSpeed(textSpeed, fallback);
  state.textSpeed = nextTextSpeed;
  state.defaultValues.textSpeed = nextTextSpeed;
};

export const selectMode = ({ state }) => state.mode;

export const selectSpriteSelectionState = ({ state }) => ({
  spriteCharacterId: state.spriteCharacterId,
  spriteTransformId: state.spriteTransformId,
  selectedSpriteIds: state.selectedSpriteIds,
  selectedSpriteGroupId: state.selectedSpriteGroupId,
});

export const selectSpriteCharacterId = ({ state }) => state.spriteCharacterId;

export const selectTempSelectedSpriteIds = ({ state }) =>
  state.tempSelectedSpriteIds;

export const selectDialogueBuildState = ({ state }) => ({
  mode: state.mode,
  selectedMode: state.selectedMode,
  selectedResourceId: state.selectedResourceId,
  selectedCharacterId: state.selectedCharacterId,
  customCharacterName: state.customCharacterName,
  characterName: state.characterName,
  characterSpriteEnabled: state.characterSpriteEnabled,
  spriteCharacterId: state.spriteCharacterId,
  spriteTransformId: state.spriteTransformId,
  spriteAnimationMode: state.spriteAnimationMode,
  spriteAnimationId: state.spriteAnimationId,
  selectedSpriteIds: state.selectedSpriteIds,
  tempSelectedSpriteIds: state.tempSelectedSpriteIds,
  appendDialogue: state.appendDialogue,
  persistCharacter: state.persistCharacter,
  clearPage: state.clearPage,
  customizeTextSpeed: state.customizeTextSpeed,
  textSpeed: state.textSpeed,
});

export const selectDialogueFormState = ({ state }) => ({
  selectedMode: state.selectedMode,
  selectedResourceId: state.selectedResourceId,
  selectedCharacterId: state.selectedCharacterId,
  customCharacterName: state.customCharacterName,
  characterName: state.characterName,
  appendDialogue: state.appendDialogue,
  persistCharacter: state.persistCharacter,
  clearPage: state.clearPage,
  customizeTextSpeed: state.customizeTextSpeed,
  textSpeed: state.textSpeed,
});

export const selectDialogueFormChangeState = ({ state }) => ({
  selectedMode: state.selectedMode,
  customizeTextSpeed: state.customizeTextSpeed,
  selectedCharacterId: state.selectedCharacterId,
  customCharacterName: state.customCharacterName,
  characterName: state.characterName,
  textSpeed: state.textSpeed,
});

export const selectSpriteSelectionConfirmState = ({ state }) => ({
  mode: state.mode,
  spriteCharacterId: state.spriteCharacterId,
  tempSelectedSpriteIds: state.tempSelectedSpriteIds,
});

export const selectCurrentSpriteSelectionGroups = ({ state, props }) => {
  const selectedCharacter = getCharacterById({
    characters: props?.characters,
    characterId: state.spriteCharacterId,
  });
  return buildSpriteSelectionGroups(selectedCharacter);
};

export const selectSelectedSpriteGroupId = ({ state, props }) => {
  const spriteSelectionGroups = selectCurrentSpriteSelectionGroups({
    state,
    props,
  });

  if (
    spriteSelectionGroups.some(
      (spriteSelectionGroup) =>
        spriteSelectionGroup.id === state.selectedSpriteGroupId,
    )
  ) {
    return state.selectedSpriteGroupId;
  }

  return spriteSelectionGroups[0]?.id;
};

export const selectCurrentSpriteItemById = (
  { state, props },
  { spriteId } = {},
) => {
  const selectedCharacter = getCharacterById({
    characters: props?.characters,
    characterId: state.spriteCharacterId,
  });

  return toFlatItems(
    selectedCharacter?.sprites ?? createEmptyCollection(),
  ).find((item) => item.id === spriteId && isCharacterSpriteResourceItem(item));
};

export const selectViewData = ({ state, props, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const layouts = props.layouts || [];
  const characters = props.characters || [];
  const transforms = props.transforms || createEmptyCollection();
  const animations = props.animations || createEmptyCollection();
  const selectedMode = state.selectedMode || "adv";
  const layoutOptions = getLayoutOptions({
    layouts,
    mode: selectedMode,
  });
  const selectedResourceId = resolveSelectedResourceId({
    layoutOptions,
    resourceId: state.selectedResourceId,
  });
  const characterCollection = toCharacterCollection({
    characters,
    tree: props.characterTree,
  });
  const characterOptions = characters
    .filter((character) => character.type === "character")
    .map((character) => ({
      value: character.id,
      label: character.name,
    }));
  const selectedSpriteCharacter = getCharacterById({
    characters,
    characterId: state.spriteCharacterId,
  });
  const spriteSelectionGroups = buildSpriteSelectionGroups(
    selectedSpriteCharacter,
  );
  const spriteGroupBoxes = buildSpriteGroupBoxViewData({
    spriteSelectionGroups,
    selectedSpriteIdsByGroup: state.selectedSpriteIds,
    spritesCollection: selectedSpriteCharacter?.sprites,
    copy,
  });
  const spritePreviewFileIds = buildCharacterSpritePreviewFileIds({
    spritesCollection: selectedSpriteCharacter?.sprites,
    spriteIds: spriteSelectionGroups.map(
      (spriteSelectionGroup) =>
        state.selectedSpriteIds?.[spriteSelectionGroup.id],
    ),
  });
  const spritePreviewLayers = buildCharacterSpritePreviewLayers({
    spritesCollection: selectedSpriteCharacter?.sprites,
    spriteIds: spriteSelectionGroups.map(
      (spriteSelectionGroup) =>
        state.selectedSpriteIds?.[spriteSelectionGroup.id],
    ),
  });
  const selectedSpriteCharacterView = selectedSpriteCharacter
    ? {
        ...selectedSpriteCharacter,
        displayName:
          selectedSpriteCharacter.name ||
          localizeCommandLineText("Unnamed Character", copy),
        hasSpritePreview: spritePreviewLayers.length > 0,
        spritePreviewFileIds,
        spritePreviewLayers,
        spriteGroupBoxes,
        showSpriteGroupBoxes: spriteGroupBoxes.length > 1,
      }
    : {
        id: "",
        displayName: localizeCommandLineText("No Character", copy),
        hasSpritePreview: false,
        spritePreviewFileIds: [],
        spritePreviewLayers: [],
        spriteGroupBoxes: [],
        showSpriteGroupBoxes: false,
      };
  const transformOptions = toFlatItems(transforms)
    .filter((item) => item.type === "transform")
    .map((transform) => ({
      value: transform.id,
      label: transform.name,
    }));
  const selectedSpriteTransformId = resolveSelectedOptionValue({
    options: transformOptions,
    value: state.spriteTransformId,
  });
  const animationItems = toFlatItems(animations).filter(
    (item) => item.type === "animation",
  );
  const updateAnimationOptions = animationItems
    .filter((item) => getAnimationType(item) === "update")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));
  const transitionAnimationOptions = animationItems
    .filter((item) => getAnimationType(item) === "transition")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));
  const characterTreeData = buildSelectableTreeData({
    collection: characterCollection,
    selectedItemId: state.spriteCharacterId,
    syntheticRootId: UNGROUPED_CHARACTER_GROUP_ID,
    itemFilter: (item) => item.type === "character",
    searchQuery: state.searchQuery,
    copy,
  });

  let spriteItems = [];
  let spriteGroups = [];
  let spriteSelectionTabs = [];
  let selectedSpriteGroupId = undefined;

  if (state.mode === "sprite-select" && selectedSpriteCharacter) {
    spriteSelectionTabs = spriteSelectionGroups.map((spriteSelectionGroup) => ({
      id: spriteSelectionGroup.id,
      label: spriteSelectionGroup.name,
    }));
    selectedSpriteGroupId = selectSelectedSpriteGroupId({ state, props });
    const selectedSpriteGroup = spriteSelectionGroups.find(
      (spriteSelectionGroup) =>
        spriteSelectionGroup.id === selectedSpriteGroupId,
    );
    const selectedSpriteId =
      selectedSpriteGroupId &&
      state.tempSelectedSpriteIds?.[selectedSpriteGroupId];
    const spriteTreeData = buildSelectableTreeData({
      collection: selectedSpriteCharacter.sprites ?? createEmptyCollection(),
      selectedItemId: selectedSpriteId,
      syntheticRootId: UNGROUPED_SPRITE_GROUP_ID,
      itemFilter: (item) =>
        isCharacterSpriteResourceItem(item) &&
        matchesSpriteGroupTags({
          item,
          tagIds: selectedSpriteGroup?.tags,
        }),
      itemViewMapper: buildSpritePreviewItemViewData,
      hideEmptyGroups: (selectedSpriteGroup?.tags ?? []).length > 0,
      searchQuery: state.searchQuery,
      copy,
    });
    spriteItems = spriteTreeData.explorerItems;
    spriteGroups = spriteTreeData.groups;
  }

  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
  ];

  if (state.mode === "character-select") {
    breadcrumb.push({
      id: "current",
      label: "Dialogue Box",
      click: true,
    });
    breadcrumb.push({
      label: "Select Character",
    });
  } else if (state.mode === "sprite-select") {
    breadcrumb.push({
      id: "current",
      label: "Dialogue Box",
      click: true,
    });
    breadcrumb.push({
      id: "character-select",
      label: selectedSpriteCharacter?.name || "Character",
      click: true,
    });
    breadcrumb.push({
      label: "Sprite Selection",
    });
  } else {
    breadcrumb.push({
      label: "Dialogue Box",
    });
  }

  const mappedFields = state.form.fields.map((field) => {
    if (field.name === "mode") {
      return {
        ...field,
        value: selectedMode,
      };
    }
    if (field.name === "resourceId") {
      return {
        ...field,
        options: layoutOptions,
        value: selectedResourceId,
        label: "Layout",
      };
    }
    if (field.name === "characterId") {
      return {
        ...field,
        options: characterOptions,
        value: state.selectedCharacterId,
      };
    }
    if (field.name === "customCharacterName") {
      return {
        ...field,
        value: state.customCharacterName,
      };
    }
    if (field.name === "characterName") {
      return {
        ...field,
        value: state.characterName,
      };
    }
    if (field.name === "persistCharacter") {
      return {
        ...field,
        value: state.persistCharacter,
      };
    }
    if (field.name === "append") {
      return {
        ...field,
        value: state.appendDialogue,
      };
    }
    if (field.name === "clearPage") {
      return {
        ...field,
        value: state.clearPage,
      };
    }
    if (field.name === "customizeTextSpeed") {
      return {
        ...field,
        value: state.customizeTextSpeed,
      };
    }
    if (field.name === "textSpeed") {
      return {
        ...field,
        value: normalizeTextSpeed(state.textSpeed),
      };
    }
    return field;
  });

  const defaultValues = {
    mode: selectedMode,
    resourceId: selectedResourceId,
    characterId: state.selectedCharacterId,
    customCharacterName: state.customCharacterName,
    characterName: state.characterName,
    append: state.appendDialogue,
    persistCharacter: state.persistCharacter,
    clearPage: state.clearPage,
    customizeTextSpeed: state.customizeTextSpeed,
    textSpeed: normalizeTextSpeed(state.textSpeed),
  };
  const context = {
    values: defaultValues,
  };

  return {
    mode: state.mode,
    layouts: layoutOptions,
    characters: characterOptions,
    selectedResourceId,
    selectedCharacterId: state.selectedCharacterId,
    customCharacterName: state.customCharacterName,
    characterName: state.characterName,
    characterSpriteEnabled: state.characterSpriteEnabled,
    spriteCharacterId: state.spriteCharacterId,
    selectedSpriteCharacter: selectedSpriteCharacterView,
    hasSpriteCharacter: !!selectedSpriteCharacter,
    spriteTransformId: selectedSpriteTransformId,
    spriteAnimationMode: state.spriteAnimationMode,
    spriteAnimationId: state.spriteAnimationId,
    selectedSpriteIds: state.selectedSpriteIds,
    selectedMode,
    appendDialogue: state.appendDialogue,
    persistCharacter: state.persistCharacter,
    clearPage: state.clearPage,
    customizeTextSpeed: state.customizeTextSpeed,
    textSpeed: normalizeTextSpeed(state.textSpeed),
    submitDisabled: !selectedResourceId,
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    form: {
      ...state.form,
      fields: localizeCommandLineForm({ fields: mappedFields }, copy).fields,
    },
    defaultValues,
    context,
    items: characterTreeData.explorerItems,
    groups: characterTreeData.groups,
    transformOptions,
    animationModeOptions: localizeCommandLineOptions(
      ANIMATION_MODE_OPTIONS,
      copy,
    ),
    updateAnimationOptions,
    transitionAnimationOptions,
    spriteItems,
    spriteGroups,
    showSpriteGroupTabs: spriteSelectionTabs.length > 1,
    spriteSelectionTabs,
    selectedSpriteGroupId,
    searchQuery: state.searchQuery,
    searchPlaceholder: localizeCommandLineText("Search...", copy),
    noAvatarLabel: localizeCommandLineText("No Avatar", copy),
    noPreviewLabel: localizeCommandLineText("No preview", copy),
    transformLabel: localizeCommandLineText("Transform", copy),
    clearButtonLabel: localizeCommandLineText("Clear", copy),
    animationLabel: localizeCommandLineText("Animation", copy),
    spriteGroupsLabel: localizeCommandLineText("Sprite Groups", copy),
    speakerSpriteLabel: localizeCommandLineText(SPEAKER_SPRITE_LABEL, copy),
    speakerSpriteTooltip: state.speakerSpriteTooltip,
    speakerSpriteTooltipContent: localizeCommandLineText(
      SPEAKER_SPRITE_TOOLTIP,
      copy,
    ),
    submitButtonLabel: localizeCommandLineText("Submit", copy),
    selectButtonLabel: localizeCommandLineText("Select", copy),
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewKind: state.fullImagePreviewKind,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    fullImagePreviewAtlas: state.fullImagePreviewAtlas,
    fullImagePreviewAnimation: state.fullImagePreviewAnimation,
    fullImagePreviewKey: state.fullImagePreviewKey,
  };
};
