import {
  DEFAULT_PROJECT_RESOLUTION,
  scaleLayoutElementItemForProjectResolution,
} from "./projectResolution.js";

const BASE_TRANSFORM = {
  x: 0,
  y: 0,
  anchorX: 0,
  anchorY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

const TEXT_TYPE_SET = new Set([
  "text",
  "text-revealing",
  "text-ref-character-name",
  "text-revealing-ref-dialogue-content",
  "text-ref-choice-item-content",
  "text-ref-save-load-slot-date",
  "text-ref-dialogue-line-character-name",
  "text-ref-dialogue-line-content",
  "text-ref-history-line-character-name",
  "text-ref-history-line-content",
]);

const CONTAINER_TYPE_SET = new Set([
  "container",
  "container-ref-choice-item",
  "container-ref-save-load-slot",
  "container-ref-dialogue-line",
  "container-ref-history-line",
  "container-ref-confirm-dialog-ok",
  "container-ref-confirm-dialog-cancel",
]);

const supportsLayoutEditorWidthMode = (itemType) => {
  return typeof itemType === "string" && itemType.startsWith("text");
};

const CREATE_TEMPLATES = {
  container: () => ({
    type: "container",
    name: "Container",
    ...BASE_TRANSFORM,
    gap: 0,
  }),
  sprite: () => ({
    type: "sprite",
    name: "Sprite",
    ...BASE_TRANSFORM,
    aspectRatioLock: 1,
    width: 0,
    height: 0,
  }),
  particle: () => ({
    type: "particle",
    name: "Particle",
    ...BASE_TRANSFORM,
    width: 0,
    height: 0,
  }),
  "spritesheet-animation": () => ({
    type: "spritesheet-animation",
    name: "Spritesheet Animation",
    ...BASE_TRANSFORM,
    width: 0,
    height: 0,
  }),
  text: () => ({
    type: "text",
    name: "Text",
    ...BASE_TRANSFORM,
    text: "text",
    textStyle: {
      align: "left",
    },
  }),
  slider: () => ({
    type: "slider",
    name: "Slider",
    ...BASE_TRANSFORM,
    width: 400,
    height: 20,
    direction: "horizontal",
    min: 0,
    max: 100,
    step: 1,
    initialValue: 0,
  }),
  "fragment-ref": () => ({
    type: "fragment-ref",
    name: "Fragment",
    ...BASE_TRANSFORM,
    width: 100,
    height: 100,
    fragmentLayoutId: undefined,
  }),
  "slider-horizontal": () => ({
    type: "slider",
    name: "Slider",
    ...BASE_TRANSFORM,
    width: 400,
    height: 20,
    direction: "horizontal",
    min: 0,
    max: 100,
    step: 1,
    initialValue: 0,
  }),
  "slider-vertical": () => ({
    type: "slider",
    name: "Slider",
    ...BASE_TRANSFORM,
    width: 20,
    height: 400,
    direction: "vertical",
    min: 0,
    max: 100,
    step: 1,
    initialValue: 0,
  }),
  "text-dialogue-content": () => ({
    type: "text-revealing-ref-dialogue-content",
    name: "Text (Dialogue Content)",
    ...BASE_TRANSFORM,
    text: "text",
    textStyle: {
      wordWrapWidth: 300,
      align: "left",
    },
  }),
  "text-character-name": () => ({
    type: "text-ref-character-name",
    name: "Text (Character Name)",
    ...BASE_TRANSFORM,
    text: "text",
    textStyle: {
      wordWrapWidth: 300,
      align: "left",
    },
  }),
  "container-dialogue-line": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "container-ref-dialogue-line",
        name: "Container (Dialogue Line)",
        ...BASE_TRANSFORM,
        width: 1640,
        height: 120,
      },
      projectResolution,
    ),
  "text-dialogue-line-character-name": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "text-ref-dialogue-line-character-name",
        name: "Text (Line Character Name)",
        $when: "line.characterName",
        ...BASE_TRANSFORM,
        width: 280,
        height: 40,
        text: "text",
        textStyle: {
          wordWrapWidth: 300,
          align: "left",
        },
      },
      projectResolution,
    ),
  "text-dialogue-line-content": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "text-revealing",
        name: "Text (Line Content)",
        ...BASE_TRANSFORM,
        x: 0,
        y: 44,
        width: 1640,
        height: 72,
        text: "${line.content[0].text}",
        textStyle: {
          wordWrapWidth: 300,
          align: "left",
        },
      },
      projectResolution,
    ),
  "container-history-line": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "container-ref-history-line",
        name: "Container (History Item)",
        ...BASE_TRANSFORM,
        width: 920,
        gap: 5,
        direction: "vertical",
      },
      projectResolution,
    ),
  "text-history-line-character-name": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "text-ref-history-line-character-name",
        name: "Text (History Character Name)",
        $when: "item.characterName",
        ...BASE_TRANSFORM,
        width: 920,
        height: 40,
        text: "text",
        textStyle: {
          wordWrapWidth: 300,
          align: "left",
        },
      },
      projectResolution,
    ),
  "text-history-line-content": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "text-ref-history-line-content",
        name: "Text (History Line Content)",
        ...BASE_TRANSFORM,
        width: 920,
        height: 72,
        text: "text",
        textStyle: {
          wordWrapWidth: 300,
          align: "left",
        },
      },
      projectResolution,
    ),
  "container-choice-item": () => ({
    type: "container-ref-choice-item",
    name: "Container (Choice Item)",
    ...BASE_TRANSFORM,
  }),
  "container-save-load-slot": () => ({
    type: "container-ref-save-load-slot",
    name: "Container (Save/Load Slot)",
    ...BASE_TRANSFORM,
    paginationMode: "continuous",
    paginationSize: 3,
  }),
  "container-confirm-dialog-ok": () => ({
    type: "container-ref-confirm-dialog-ok",
    name: "Container (Confirm OK)",
    ...BASE_TRANSFORM,
    width: 160,
    height: 64,
  }),
  "container-confirm-dialog-cancel": () => ({
    type: "container-ref-confirm-dialog-cancel",
    name: "Container (Confirm Cancel)",
    ...BASE_TRANSFORM,
    width: 160,
    height: 64,
  }),
  "sprite-save-load-slot-image": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "sprite-ref-save-load-slot-image",
        name: "Sprite (Save Image)",
        ...BASE_TRANSFORM,
        aspectRatioLock: 320 / 180,
        width: 320,
        height: 180,
      },
      projectResolution,
    ),
  "text-save-load-slot-date": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "text-ref-save-load-slot-date",
        name: "Text (Save Date)",
        ...BASE_TRANSFORM,
        y: 192,
        text: "text",
        textStyle: {
          wordWrapWidth: 320,
          align: "left",
        },
      },
      projectResolution,
    ),
  "text-choice-item-content": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "text-ref-choice-item-content",
        name: "Text (Choice Item Content)",
        ...BASE_TRANSFORM,
        x: 960,
        y: 24,
        anchorX: 0.5,
        text: "text",
        textStyle: {
          wordWrapWidth: 300,
          align: "center",
        },
      },
      projectResolution,
    ),
  rect: () => ({
    type: "rect",
    name: "Rect",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  }),
};

const resolveSliderDirection = (value) => {
  return value === "vertical" ? "vertical" : "horizontal";
};

const createSliderSavedStateKey = (direction) => {
  const resolvedDirection = resolveSliderDirection(direction);
  return `_saved${resolvedDirection.charAt(0).toUpperCase()}${resolvedDirection.slice(1)}`;
};

const findImageIdByName = (imagesData, imageName) => {
  if (!imageName) {
    return undefined;
  }

  for (const [imageId, image] of Object.entries(imagesData?.items ?? {})) {
    if (image?.type === "image" && image?.name === imageName) {
      return imageId;
    }
  }

  return undefined;
};

const resolveSliderDefaultImageIds = ({ direction, imagesData } = {}) => {
  const resolvedDirection = resolveSliderDirection(direction);
  return {
    barImageId: findImageIdByName(
      imagesData,
      resolvedDirection === "vertical" ? "slider_bar_vertical" : "slider_bar",
    ),
    hoverBarImageId: findImageIdByName(
      imagesData,
      resolvedDirection === "vertical"
        ? "slider_bar_vertical_hover"
        : "slider_bar_hover",
    ),
    thumbImageId: findImageIdByName(imagesData, "slider_thumb"),
    hoverThumbImageId: findImageIdByName(imagesData, "slider_thumb_hover"),
  };
};

export const toAlphanumericId = (value, fallback = "sliderUpdate") => {
  const sanitized = String(value || "").replace(/[^a-zA-Z0-9]/g, "");
  return sanitized || fallback;
};

const applySliderDirectionChange = ({
  currentItem,
  nextItem,
  value,
  imagesData,
}) => {
  const oldDirection = resolveSliderDirection(currentItem.direction);
  const newDirection = resolveSliderDirection(value);

  nextItem.direction = value === null ? undefined : newDirection;
  nextItem[createSliderSavedStateKey(oldDirection)] = {
    barImageId: currentItem.barImageId,
    hoverBarImageId: currentItem.hoverBarImageId,
    thumbImageId: currentItem.thumbImageId,
    hoverThumbImageId: currentItem.hoverThumbImageId,
    width: currentItem.width,
    height: currentItem.height,
  };

  const saved = currentItem[createSliderSavedStateKey(newDirection)];
  if (saved) {
    nextItem.barImageId = saved.barImageId;
    nextItem.hoverBarImageId = saved.hoverBarImageId;
    nextItem.thumbImageId = saved.thumbImageId;
    nextItem.hoverThumbImageId = saved.hoverThumbImageId;
    nextItem.width = saved.width;
    nextItem.height = saved.height;
    return nextItem;
  }

  const defaultImageIds = resolveSliderDefaultImageIds({
    direction: newDirection,
    imagesData,
  });
  nextItem.barImageId = defaultImageIds.barImageId ?? currentItem.barImageId;
  nextItem.hoverBarImageId =
    defaultImageIds.hoverBarImageId ?? currentItem.hoverBarImageId;
  nextItem.thumbImageId =
    defaultImageIds.thumbImageId ?? currentItem.thumbImageId;
  nextItem.hoverThumbImageId =
    defaultImageIds.hoverThumbImageId ?? currentItem.hoverThumbImageId;
  nextItem.width = currentItem.height;
  nextItem.height = currentItem.width;

  return nextItem;
};

const applySpriteAutoSize = ({ nextItem, imagesData }) => {
  if (
    nextItem.type !== "sprite" ||
    (nextItem.width !== 0 && nextItem.height !== 0)
  ) {
    return nextItem;
  }

  const image = imagesData?.items?.[nextItem.imageId];
  if (!image) {
    return nextItem;
  }

  if (nextItem.width === 0 && Number.isFinite(image.width)) {
    nextItem.width = image.width;
  }
  if (nextItem.height === 0 && Number.isFinite(image.height)) {
    nextItem.height = image.height;
  }

  if (
    Number.isFinite(nextItem.width) &&
    Number.isFinite(nextItem.height) &&
    nextItem.width > 0 &&
    nextItem.height > 0
  ) {
    nextItem.aspectRatioLock = nextItem.width / nextItem.height;
  }

  return nextItem;
};

const TYPE_FAMILIES = {
  container: "container",
  "container-ref-choice-item": "container",
  "container-ref-save-load-slot": "container",
  "container-ref-dialogue-line": "container",
  "container-ref-history-line": "container",
  "container-ref-confirm-dialog-ok": "container",
  "container-ref-confirm-dialog-cancel": "container",
  "fragment-ref": "fragment",
  sprite: "sprite",
  particle: "particle",
  "spritesheet-animation": "spritesheetAnimation",
  "sprite-ref-save-load-slot-image": "sprite",
  text: "text",
  "text-revealing": "text",
  "text-ref-character-name": "text",
  "text-revealing-ref-dialogue-content": "text",
  "text-ref-choice-item-content": "text",
  "text-ref-save-load-slot-date": "text",
  "text-ref-dialogue-line-character-name": "text",
  "text-ref-dialogue-line-content": "text",
  "text-ref-history-line-character-name": "text",
  "text-ref-history-line-content": "text",
  slider: "slider",
  rect: "rect",
};

const DEFAULT_CAPABILITIES = {
  supportsSize: true,
  supportsHeight: true,
  supportsAnchor: false,
  supportsDirection: false,
  supportsScroll: false,
  supportsChildInteractionInheritance: false,
  supportsTextEditing: false,
  supportsTextRevealEffect: false,
  supportsTextStyles: false,
  supportsTextAlignment: false,
  supportsActions: false,
  supportsSpriteImages: false,
  supportsSpritesheetAnimation: false,
  supportsParticleSelection: false,
  supportsSliderImages: false,
  supportsSliderValues: false,
};

const FAMILY_CAPABILITIES = {
  container: {
    supportsSize: false,
    supportsAnchor: true,
    supportsDirection: true,
    supportsScroll: true,
    supportsChildInteractionInheritance: true,
    supportsActions: true,
  },
  fragment: {
    supportsAnchor: true,
  },
  sprite: {
    supportsAnchor: true,
    supportsSpriteImages: true,
    supportsActions: true,
  },
  particle: {
    supportsAnchor: true,
    supportsParticleSelection: true,
    supportsActions: true,
  },
  spritesheetAnimation: {
    supportsAnchor: true,
    supportsSpritesheetAnimation: true,
    supportsActions: true,
  },
  text: {
    supportsHeight: false,
    supportsAnchor: true,
    supportsTextStyles: true,
    supportsTextAlignment: true,
  },
  slider: {
    supportsSliderImages: true,
    supportsSliderValues: true,
    supportsActions: true,
  },
  rect: {
    supportsActions: true,
  },
};

const ITEM_TYPE_CAPABILITY_OVERRIDES = {
  text: {
    supportsTextEditing: true,
    supportsActions: true,
  },
  "text-revealing": {
    supportsTextEditing: true,
    supportsTextRevealEffect: true,
    supportsActions: true,
  },
  "text-revealing-ref-dialogue-content": {
    supportsTextRevealEffect: true,
    supportsTextAlignment: false,
  },
};

const TYPE_RULES = {
  container: {
    normalizeFieldValue: ({ name, value }) => {
      if (name === "direction" && (value === null || value === "")) {
        return undefined;
      }

      if (name === "paginationMode" && (value === null || value === "")) {
        return "continuous";
      }

      return value;
    },
  },
  fragment: {
    normalizeFieldValue: ({ name, value }) => {
      if (name === "fragmentLayoutId" && (value === null || value === "")) {
        return undefined;
      }

      return value;
    },
  },
  sprite: {
    finalizeFieldChange: ({ nextItem, imagesData }) => {
      return applySpriteAutoSize({
        nextItem,
        imagesData,
      });
    },
  },
  particle: {
    normalizeFieldValue: ({ name, value }) => {
      if (name === "particleId" && (value === null || value === "")) {
        return undefined;
      }

      return value;
    },
  },
  spritesheetAnimation: {
    normalizeFieldValue: ({ name, value }) => {
      if (
        (name === "resourceId" || name === "animationName") &&
        (value === null || value === "")
      ) {
        return undefined;
      }

      return value;
    },
  },
  text: {},
  slider: {
    normalizeFieldValue: ({ name, value }) => {
      if (name === "direction" && (value === null || value === "")) {
        return undefined;
      }

      return value;
    },
    applyFieldChange: ({ currentItem, nextItem, name, value, imagesData }) => {
      if (name === "direction") {
        return applySliderDirectionChange({
          currentItem,
          nextItem,
          value,
          imagesData,
        });
      }

      return nextItem;
    },
  },
  rect: {},
};

const DEFAULT_PANEL_FEATURES = ["layout", "appearance", "visibility"];
const PANEL_FEATURES_BY_TYPE = {
  container: [
    ...DEFAULT_PANEL_FEATURES,
    "actions",
    "childInteraction",
    "scroll",
  ],
  "container-ref-choice-item": [
    ...DEFAULT_PANEL_FEATURES,
    "actions",
    "childInteraction",
  ],
  "container-ref-save-load-slot": [
    ...DEFAULT_PANEL_FEATURES,
    "actions",
    "pagination",
    "childInteraction",
  ],
  "container-ref-dialogue-line": [
    ...DEFAULT_PANEL_FEATURES,
    "actions",
    "childInteraction",
  ],
  "container-ref-history-line": [
    ...DEFAULT_PANEL_FEATURES,
    "actions",
    "childInteraction",
  ],
  "container-ref-confirm-dialog-ok": [...DEFAULT_PANEL_FEATURES, "actions"],
  "container-ref-confirm-dialog-cancel": [...DEFAULT_PANEL_FEATURES, "actions"],
  sprite: [...DEFAULT_PANEL_FEATURES, "images", "actions"],
  particle: [...DEFAULT_PANEL_FEATURES, "particle", "actions"],
  "spritesheet-animation": [
    ...DEFAULT_PANEL_FEATURES,
    "spritesheet",
    "actions",
  ],
  "sprite-ref-save-load-slot-image": [...DEFAULT_PANEL_FEATURES, "images"],
  text: [...DEFAULT_PANEL_FEATURES, "text", "textStyles", "actions"],
  "text-revealing": [
    ...DEFAULT_PANEL_FEATURES,
    "text",
    "textStyles",
    "revealEffect",
    "actions",
  ],
  "text-revealing-ref-dialogue-content": [
    ...DEFAULT_PANEL_FEATURES,
    "text",
    "textStyles",
    "revealEffect",
  ],
  "text-ref-character-name": [...DEFAULT_PANEL_FEATURES, "textStyles"],
  "text-ref-choice-item-content": [...DEFAULT_PANEL_FEATURES, "textStyles"],
  "text-ref-save-load-slot-date": [...DEFAULT_PANEL_FEATURES, "textStyles"],
  "text-ref-dialogue-line-character-name": [
    ...DEFAULT_PANEL_FEATURES,
    "textStyles",
  ],
  "text-ref-dialogue-line-content": [...DEFAULT_PANEL_FEATURES, "textStyles"],
  "text-ref-history-line-character-name": [
    ...DEFAULT_PANEL_FEATURES,
    "textStyles",
  ],
  "text-ref-history-line-content": [...DEFAULT_PANEL_FEATURES, "textStyles"],
  slider: [...DEFAULT_PANEL_FEATURES, "slider", "actions"],
  rect: [...DEFAULT_PANEL_FEATURES, "actions"],
  "fragment-ref": [...DEFAULT_PANEL_FEATURES, "fragmentRef"],
};

const PREVIEW_DEPENDENCIES_BY_TYPE = {
  "fragment-ref": { fragments: true },
  "container-ref-choice-item": { choice: true },
  "text-ref-choice-item-content": { choice: true },
  "container-ref-save-load-slot": { saveLoad: true },
  "sprite-ref-save-load-slot-image": { saveLoad: true },
  "text-ref-save-load-slot-date": { saveLoad: true },
  "text-revealing": { dialogue: true },
  "text-revealing-ref-dialogue-content": { dialogue: true },
  "text-ref-character-name": { dialogue: true },
  "container-ref-dialogue-line": { dialogue: true },
  "text-ref-dialogue-line-character-name": { dialogue: true },
  "text-ref-dialogue-line-content": { dialogue: true },
  "container-ref-history-line": { historyDialogue: true },
  "text-ref-history-line-character-name": { historyDialogue: true },
  "text-ref-history-line-content": { historyDialogue: true },
  "container-ref-confirm-dialog-ok": { confirmDialog: true },
  "container-ref-confirm-dialog-cancel": { confirmDialog: true },
};

const DEFAULT_IMMEDIATE_PERSIST_FIELDS = [
  "click",
  "click.",
  "rightClick",
  "rightClick.",
  "change",
  "change.",
];

const IMMEDIATE_PERSIST_FIELDS_BY_TYPE = {
  sprite: [...DEFAULT_IMMEDIATE_PERSIST_FIELDS, "conditionalOverrides"],
  "sprite-ref-save-load-slot-image": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  text: [...DEFAULT_IMMEDIATE_PERSIST_FIELDS, "conditionalOverrides"],
  "text-revealing": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  "text-revealing-ref-dialogue-content": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  "text-ref-character-name": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  "text-ref-choice-item-content": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  "text-ref-save-load-slot-date": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  "text-ref-dialogue-line-character-name": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  "text-ref-dialogue-line-content": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  "text-ref-history-line-character-name": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  "text-ref-history-line-content": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "conditionalOverrides",
  ],
  "container-ref-save-load-slot": [
    ...DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    "paginationMode",
    "paginationSize",
  ],
};

export const isLayoutEditorTextItemType = (itemType) => {
  return TEXT_TYPE_SET.has(itemType);
};

export const isLayoutEditorContainerItemType = (itemType) => {
  return CONTAINER_TYPE_SET.has(itemType);
};

export const createLayoutEditorItemTemplate = (
  createType,
  { projectResolution = DEFAULT_PROJECT_RESOLUTION } = {},
) => {
  const templateFactory = CREATE_TEMPLATES[createType];
  return templateFactory ? templateFactory(projectResolution) : {};
};

export const getLayoutEditorItemCapabilities = (itemType) => {
  const family = TYPE_FAMILIES[itemType];

  return {
    ...DEFAULT_CAPABILITIES,
    ...FAMILY_CAPABILITIES[family],
    ...ITEM_TYPE_CAPABILITY_OVERRIDES[itemType],
  };
};

export const canResizeLayoutEditorItemWidth = (item = {}) => {
  const capabilities = getLayoutEditorItemCapabilities(item?.type);
  if (capabilities.supportsSize !== true) {
    return false;
  }

  if (supportsLayoutEditorWidthMode(item?.type)) {
    return item?.width !== undefined;
  }

  return true;
};

export const canResizeLayoutEditorItemHeight = (item = {}) => {
  const capabilities = getLayoutEditorItemCapabilities(item?.type);
  return (
    capabilities.supportsSize === true && capabilities.supportsHeight === true
  );
};

export const getLayoutEditorItemResizeEdges = (item = {}) => {
  const edges = [];

  if (canResizeLayoutEditorItemWidth(item)) {
    edges.push("left", "right");
  }

  if (canResizeLayoutEditorItemHeight(item)) {
    edges.push("top", "bottom");
  }

  return edges;
};

export const getLayoutEditorTypeRules = (itemType) => {
  const family = TYPE_FAMILIES[itemType];
  return family ? (TYPE_RULES[family] ?? {}) : {};
};

export const getLayoutEditorElementDefinition = (itemType) => {
  return {
    type: itemType,
    capabilities: getLayoutEditorItemCapabilities(itemType),
    typeRules: getLayoutEditorTypeRules(itemType),
    panelFeatures: PANEL_FEATURES_BY_TYPE[itemType] ?? DEFAULT_PANEL_FEATURES,
    previewDependencies: PREVIEW_DEPENDENCIES_BY_TYPE[itemType] ?? {},
    immediatePersistFields:
      IMMEDIATE_PERSIST_FIELDS_BY_TYPE[itemType] ??
      DEFAULT_IMMEDIATE_PERSIST_FIELDS,
    isContainer: isLayoutEditorContainerItemType(itemType),
    isText: isLayoutEditorTextItemType(itemType),
  };
};

export const getLayoutEditorCreateDefinition = (
  createType,
  { projectResolution } = {},
) => {
  const template = createLayoutEditorItemTemplate(createType, {
    projectResolution,
  });
  const definition = getLayoutEditorElementDefinition(template?.type);

  return {
    createType,
    template,
    itemType: template?.type,
    ...definition,
  };
};
