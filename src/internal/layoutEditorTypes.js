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
  "text-ref-dialogue-line-character-name",
  "text-ref-dialogue-line-content",
]);

const CONTAINER_TYPE_SET = new Set([
  "container",
  "container-ref-choice-item",
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
    style: {
      align: "left",
    },
  }),
  "slider-horizontal": () => ({
    type: "slider",
    name: "Slider",
    ...BASE_TRANSFORM,
    width: 400,
    height: 20,
    direction: "horizontal",
    thumbImageId: "slider_thumb_default",
    barImageId: "slider_bar_default",
    hoverThumbImageId: "slider_thumb_hover",
    hoverBarImageId: "slider_bar_hover",
    min: 0,
    max: 100,
    step: 1,
    initialValue: 0,
    variableId: "",
  }),
  "slider-vertical": () => ({
    type: "slider",
    name: "Slider",
    ...BASE_TRANSFORM,
    width: 20,
    height: 400,
    direction: "vertical",
    thumbImageId: "slider_thumb_default",
    barImageId: "slider_bar_vertical",
    hoverThumbImageId: "slider_thumb_hover",
    hoverBarImageId: "slider_bar_vertical_hover",
    min: 0,
    max: 100,
    step: 1,
    initialValue: 0,
    variableId: "",
  }),
  "text-dialogue-content": () => ({
    type: "text-revealing-ref-dialogue-content",
    name: "Text (Dialogue Content)",
    ...BASE_TRANSFORM,
    text: "text",
    style: {
      wordWrapWidth: 300,
      align: "left",
    },
  }),
  "text-character-name": () => ({
    type: "text-ref-character-name",
    name: "Text (Character Name)",
    ...BASE_TRANSFORM,
    text: "text",
    style: {
      wordWrapWidth: 300,
      align: "left",
    },
  }),
  "container-dialogue-line": () => ({
    type: "container-ref-dialogue-line",
    name: "Container (Dialogue Line)",
    ...BASE_TRANSFORM,
    width: 1640,
    height: 120,
  }),
  "text-dialogue-line-character-name": () => ({
    type: "text-ref-dialogue-line-character-name",
    name: "Text (Line Character Name)",
    $when: "line.characterName",
    ...BASE_TRANSFORM,
    width: 280,
    height: 40,
    text: "text",
    style: {
      wordWrapWidth: 300,
      align: "left",
    },
  }),
  "text-dialogue-line-content": () => ({
    type: "text-ref-dialogue-line-content",
    name: "Text (Line Content)",
    ...BASE_TRANSFORM,
    x: 0,
    y: 44,
    width: 1640,
    height: 72,
    text: "text",
    style: {
      wordWrapWidth: 300,
      align: "left",
    },
  }),
  "container-choice-item": () => ({
    type: "container-ref-choice-item",
    name: "Container (Choice Item)",
    ...BASE_TRANSFORM,
  }),
  "text-choice-item-content": () => ({
    type: "text-ref-choice-item-content",
    name: "Text (Choice Item Content)",
    ...BASE_TRANSFORM,
    text: "text",
    style: {
      wordWrapWidth: 300,
      align: "left",
    },
  }),
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

const applySliderDirectionChange = ({ currentItem, nextItem, value }) => {
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

  if (newDirection === "vertical") {
    nextItem.barImageId = "slider_bar_vertical";
    nextItem.hoverBarImageId = "slider_bar_vertical_hover";
  } else {
    nextItem.barImageId = "slider_bar_default";
    nextItem.hoverBarImageId = "slider_bar_hover";
  }

  nextItem.thumbImageId = "slider_thumb_default";
  nextItem.hoverThumbImageId = "slider_thumb_hover";
  nextItem.width = currentItem.height;
  nextItem.height = currentItem.width;

  return nextItem;
};

const applySliderVariableBindingChange = ({ nextItem, value }) => {
  const variableId = value ?? "";

  nextItem.variableId = variableId;

  if (variableId) {
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
  "container-ref-dialogue-line": "container",
  sprite: "sprite",
  text: "text",
  "text-revealing": "text",
  "text-ref-character-name": "text",
  "text-revealing-ref-dialogue-content": "text",
  "text-ref-choice-item-content": "text",
  "text-ref-dialogue-line-character-name": "text",
  "text-ref-dialogue-line-content": "text",
  slider: "slider",
  rect: "rect",
};

const DEFAULT_CAPABILITIES = {
  supportsHeight: true,
  supportsAnchor: false,
  supportsDirection: false,
  supportsTextEditing: false,
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
};

const TYPE_RULES = {
  container: {
    normalizeFieldValue: ({ name, value }) => {
      if (name === "direction" && (value === null || value === "")) {
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

      if (name === "variableId" && value === null) {
        return "";
      }

      return value;
    },
    applyFieldChange: ({ currentItem, nextItem, name, value }) => {
      if (name === "direction") {
        return applySliderDirectionChange({
          currentItem,
          nextItem,
          value,
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

export const createLayoutEditorItemTemplate = (createType) => {
  const templateFactory = CREATE_TEMPLATES[createType];
  return templateFactory ? templateFactory() : {};
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
