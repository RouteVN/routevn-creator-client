import { toFlatItems } from "../../internal/project/tree.js";

const SPRITE_GROUP_FIELD_PREFIX = "spriteGroup:";

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

const DEFAULT_SPRITE_GROUP_ID = "base";
const DEFAULT_SPRITE_GROUP_NAME = "Sprite";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

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

const getSpriteGroupFieldName = (spriteGroupId) => {
  return `${SPRITE_GROUP_FIELD_PREFIX}${spriteGroupId}`;
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

const getSpriteOptionsForGroup = ({ character, spriteGroup } = {}) => {
  return toFlatItems(character?.sprites ?? createEmptyCollection())
    .filter(
      (item) =>
        item.type === "image" &&
        matchesSpriteGroupTags({
          item,
          tagIds: spriteGroup?.tags,
        }),
    )
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));
};

const resolveSelectedOptionValue = ({ options, value } = {}) => {
  if (value && options.some((option) => option.value === value)) {
    return value;
  }

  return "";
};

export const createInitialState = () => ({
  layouts: [],
  selectedResourceId: "",
  characters: [],
  selectedCharacterId: "",
  customCharacterName: false,
  characterName: "",
  characterSpriteEnabled: false,
  spriteTransformId: "",
  spriteAnimationMode: "none",
  spriteAnimationId: "",
  selectedSpriteIds: {},
  selectedMode: "adv",
  persistCharacter: false,
  clearPage: false,

  defaultValues: {
    mode: "adv",
    resourceId: "",
    characterId: "",
    customCharacterName: false,
    characterName: "",
    characterSpriteEnabled: false,
    spriteTransformId: "",
    spriteAnimationMode: "none",
    updateSpriteAnimation: "",
    transitionSpriteAnimation: "",
    persistCharacter: false,
    clearPage: false,
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
        name: "characterSpriteEnabled",
        type: "segmented-control",
        label: "Speaker Sprite",
        description: "",
        required: true,
        clearable: false,
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
      {
        $when: "values.characterSpriteEnabled",
        name: "spriteTransformId",
        type: "select",
        label: "Sprite Transform",
        description: "",
        required: true,
        placeholder: "Choose a transform...",
        options: [],
      },
      {
        $when: "values.characterSpriteEnabled",
        name: "spriteAnimationMode",
        type: "segmented-control",
        label: "Sprite Animation",
        description: "",
        required: true,
        clearable: false,
        options: ANIMATION_MODE_OPTIONS,
      },
      {
        $when:
          'values.characterSpriteEnabled && values.spriteAnimationMode == "update"',
        name: "updateSpriteAnimation",
        type: "select",
        label: "Update Animation",
        description: "",
        required: false,
        placeholder: "Choose an update animation...",
        options: [],
      },
      {
        $when:
          'values.characterSpriteEnabled && values.spriteAnimationMode == "transition"',
        name: "transitionSpriteAnimation",
        type: "select",
        label: "Transition Animation",
        description: "",
        required: false,
        placeholder: "Choose a transition animation...",
        options: [],
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

export const setLayouts = ({ state }, { layouts } = {}) => {
  state.layouts = layouts;
};

export const setSelectedResource = ({ state }, { resourceId } = {}) => {
  state.selectedResourceId = resourceId;
  state.defaultValues.resourceId = resourceId;
};

export const setSelectedCharacterId = ({ state }, { characterId } = {}) => {
  state.selectedCharacterId = characterId;
  state.defaultValues.characterId = characterId;
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
  const enabled = toBoolean(characterSpriteEnabled);
  state.characterSpriteEnabled = enabled;
  state.defaultValues.characterSpriteEnabled = enabled;
};

export const setSpriteTransformId = ({ state }, { transformId } = {}) => {
  const nextTransformId = transformId ?? "";
  state.spriteTransformId = nextTransformId;
  state.defaultValues.spriteTransformId = nextTransformId;
};

export const setSpriteAnimationMode = ({ state }, { mode } = {}) => {
  const nextMode = mode === "update" || mode === "transition" ? mode : "none";
  state.spriteAnimationMode = nextMode;
  state.defaultValues.spriteAnimationMode = nextMode;

  if (nextMode === "none") {
    state.spriteAnimationId = "";
    state.defaultValues.updateSpriteAnimation = "";
    state.defaultValues.transitionSpriteAnimation = "";
  }
};

export const setSpriteAnimationId = ({ state }, { animationId } = {}) => {
  const nextAnimationId = animationId ?? "";
  state.spriteAnimationId = nextAnimationId;
  state.defaultValues.updateSpriteAnimation =
    state.spriteAnimationMode === "update" ? nextAnimationId : "";
  state.defaultValues.transitionSpriteAnimation =
    state.spriteAnimationMode === "transition" ? nextAnimationId : "";
};

export const setSelectedSpriteIds = (
  { state },
  { spriteIdsByGroupId } = {},
) => {
  state.selectedSpriteIds = {};

  for (const [spriteGroupId, spriteId] of Object.entries(
    spriteIdsByGroupId ?? {},
  )) {
    state.selectedSpriteIds[spriteGroupId] = spriteId;
  }
};

export const setSelectedMode = ({ state }, { mode } = {}) => {
  const selectedMode = mode === "nvl" ? "nvl" : "adv";
  state.selectedMode = selectedMode;
  state.defaultValues.mode = selectedMode;
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

export const selectViewData = ({ state, props }) => {
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

  const characterOptions = characters
    .filter((character) => character.type === "character")
    .map((character) => ({
      value: character.id,
      label: character.name,
    }));

  const selectedCharacter = getCharacterById({
    characters,
    characterId: state.selectedCharacterId,
  });
  const spriteSelectionGroups = buildSpriteSelectionGroups(selectedCharacter);
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

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Dialogue Box",
    },
  ];

  const spriteGroupFields = [];
  if (state.characterSpriteEnabled && selectedCharacter) {
    for (const spriteSelectionGroup of spriteSelectionGroups) {
      spriteGroupFields.push({
        name: getSpriteGroupFieldName(spriteSelectionGroup.id),
        type: "select",
        label: spriteSelectionGroup.name,
        description: "",
        required: false,
        placeholder: `Choose ${spriteSelectionGroup.name}...`,
        options: getSpriteOptionsForGroup({
          character: selectedCharacter,
          spriteGroup: spriteSelectionGroup,
        }),
        value: state.selectedSpriteIds[spriteSelectionGroup.id] ?? "",
      });
    }
  }

  // Update form options with current data
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
    if (field.name === "characterSpriteEnabled") {
      return {
        ...field,
        value: state.characterSpriteEnabled,
      };
    }
    if (field.name === "spriteTransformId") {
      return {
        ...field,
        options: transformOptions,
        value: selectedSpriteTransformId,
      };
    }
    if (field.name === "spriteAnimationMode") {
      return {
        ...field,
        value: state.spriteAnimationMode,
      };
    }
    if (field.name === "updateSpriteAnimation") {
      return {
        ...field,
        options: updateAnimationOptions,
        value:
          state.spriteAnimationMode === "update" ? state.spriteAnimationId : "",
      };
    }
    if (field.name === "transitionSpriteAnimation") {
      return {
        ...field,
        options: transitionAnimationOptions,
        value:
          state.spriteAnimationMode === "transition"
            ? state.spriteAnimationId
            : "",
      };
    }
    if (field.name === "persistCharacter") {
      return {
        ...field,
        value: state.persistCharacter,
      };
    }
    if (field.name === "clearPage") {
      return {
        ...field,
        value: state.clearPage,
      };
    }
    return field;
  });
  const form = {
    ...state.form,
    fields: [],
  };

  for (const field of mappedFields) {
    form.fields.push(field);

    if (field.name === "spriteTransformId") {
      form.fields.push(...spriteGroupFields);
    }
  }

  // Update default values with current selections
  const defaultValues = {
    mode: selectedMode,
    resourceId: selectedResourceId,
    characterId: state.selectedCharacterId,
    customCharacterName: state.customCharacterName,
    characterName: state.characterName,
    characterSpriteEnabled: state.characterSpriteEnabled,
    spriteTransformId: selectedSpriteTransformId,
    spriteAnimationMode: state.spriteAnimationMode,
    updateSpriteAnimation:
      state.spriteAnimationMode === "update" ? state.spriteAnimationId : "",
    transitionSpriteAnimation:
      state.spriteAnimationMode === "transition" ? state.spriteAnimationId : "",
    persistCharacter: state.persistCharacter,
    clearPage: state.clearPage,
  };

  for (const spriteSelectionGroup of spriteSelectionGroups) {
    defaultValues[getSpriteGroupFieldName(spriteSelectionGroup.id)] =
      state.selectedSpriteIds[spriteSelectionGroup.id] ?? "";
  }

  const context = {
    values: defaultValues,
  };

  return {
    layouts: layoutOptions,
    characters: characterOptions,
    selectedResourceId,
    selectedCharacterId: state.selectedCharacterId,
    customCharacterName: state.customCharacterName,
    characterName: state.characterName,
    characterSpriteEnabled: state.characterSpriteEnabled,
    spriteTransformId: selectedSpriteTransformId,
    spriteAnimationMode: state.spriteAnimationMode,
    spriteAnimationId: state.spriteAnimationId,
    selectedSpriteIds: state.selectedSpriteIds,
    selectedMode,
    persistCharacter: state.persistCharacter,
    clearPage: state.clearPage,
    submitDisabled: !selectedResourceId,
    breadcrumb,
    form,
    defaultValues,
    context,
  };
};
