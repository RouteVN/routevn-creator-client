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
  "text-ref-character-name",
  "text-revealing-ref-dialogue-content",
  "text-ref-choice-item-content",
  "text-ref-save-load-slot-date",
  "text-ref-dialogue-line-character-name",
  "text-ref-dialogue-line-content",
]);

const CONTAINER_TYPE_SET = new Set([
  "container",
  "container-ref-choice-item",
  "container-ref-save-load-slot",
  "container-ref-dialogue-line",
]);

const CREATE_TEMPLATES = {
  container: () => ({
    type: "container",
    name: "Container",
    ...BASE_TRANSFORM,
    gap: 0,
    width: 100,
    height: 100,
  }),
  sprite: () => ({
    type: "sprite",
    name: "Sprite",
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
        type: "text-ref-dialogue-line-content",
        name: "Text (Line Content)",
        ...BASE_TRANSFORM,
        x: 0,
        y: 44,
        width: 1640,
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
  "sprite-save-load-slot-image": (projectResolution) =>
    scaleLayoutElementItemForProjectResolution(
      {
        type: "sprite-ref-save-load-slot-image",
        name: "Sprite (Save Image)",
        ...BASE_TRANSFORM,
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

const applySliderVariableBindingChange = ({ nextItem, value }) => {
  const variableId = value ?? undefined;

  if (variableId) {
    nextItem.variableId = variableId;
    const updateVariableId = toAlphanumericId(`slider${nextItem.id}update`);
    nextItem.change = {
      payload: {
        actions: {
          updateVariable: {
            id: updateVariableId,
            operations: [
              {
                variableId,
                op: "set",
                value: "_event.value",
              },
            ],
          },
        },
      },
    };
    nextItem.initialValue = `\${variables.${variableId}}`;
    return nextItem;
  }

  delete nextItem.variableId;
  delete nextItem.change;
  const parsedMin = Number(nextItem.min);
  nextItem.initialValue = Number.isFinite(parsedMin) ? parsedMin : 0;
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

  return nextItem;
};

const TYPE_FAMILIES = {
  container: "container",
  "container-ref-choice-item": "container",
  "container-ref-save-load-slot": "container",
  "container-ref-dialogue-line": "container",
  "fragment-ref": "fragment",
  sprite: "sprite",
  "sprite-ref-save-load-slot-image": "sprite",
  text: "text",
  "text-revealing": "text",
  "text-ref-character-name": "text",
  "text-revealing-ref-dialogue-content": "text",
  "text-ref-choice-item-content": "text",
  "text-ref-save-load-slot-date": "text",
  "text-ref-dialogue-line-character-name": "text",
  "text-ref-dialogue-line-content": "text",
  slider: "slider",
  rect: "rect",
};

const DEFAULT_CAPABILITIES = {
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
  supportsSliderImages: false,
  supportsSliderValues: false,
};

const FAMILY_CAPABILITIES = {
  container: {
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
    supportsSpriteImages: true,
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
  "text-revealing-ref-dialogue-content": {
    supportsTextRevealEffect: true,
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

      if (name === "paginationVariableId" && (value === null || value === "")) {
        return undefined;
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
  text: {},
  slider: {
    normalizeFieldValue: ({ name, value }) => {
      if (name === "direction" && (value === null || value === "")) {
        return undefined;
      }

      if (name === "variableId" && (value === null || value === "")) {
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

      if (name === "variableId") {
        return applySliderVariableBindingChange({
          nextItem,
          value,
        });
      }

      return nextItem;
    },
  },
  rect: {},
};

export const toAlphanumericId = (value, fallback = "sliderUpdate") => {
  const sanitized = String(value || "").replace(/[^a-zA-Z0-9]/g, "");
  return sanitized || fallback;
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

export const getLayoutEditorTypeRules = (itemType) => {
  const family = TYPE_FAMILIES[itemType];
  return family ? (TYPE_RULES[family] ?? {}) : {};
};
