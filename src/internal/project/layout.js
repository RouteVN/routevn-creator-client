import { resolveLayoutReferences } from "route-engine-js";
import { getFirstTextStyleId } from "../../constants/textStyles.js";
import { toAlphanumericId } from "../layoutEditorElementRegistry.js";
import { filterTreeCollection, toHierarchyStructure } from "./tree.js";
import { normalizeEngineActions } from "./engineActions.js";
import {
  getInteractionActions,
  getInteractionPayload,
  withInteractionPayload,
} from "./interactionPayload.js";

const TEXT_NODE_TYPES = new Set([
  "text",
  "text-revealing",
  "text-ref-character-name",
  "text-revealing-ref-dialogue-content",
  "text-ref-choice-item-content",
  "text-ref-save-load-slot-date",
  "text-ref-dialogue-line-character-name",
  "text-ref-dialogue-line-content",
]);

import {
  buildVisibilityConditionExpression,
  mergeWhenExpressions,
  splitVisibilityConditionFromWhen,
} from "../layoutConditions.js";

const TEXT_CONTENT_BY_TYPE = {
  "text-ref-character-name": "${dialogue.character.name}",
  "text-revealing-ref-dialogue-content": "${dialogue.content[0].text}",
  "text-ref-choice-item-content": "${item.content}",
  "text-ref-save-load-slot-date": "${formatDate(item.savedAt)}",
  "text-ref-dialogue-line-character-name": "${line.characterName}",
  "text-ref-dialogue-line-content": "${line.content[0].text}",
};

const TEXT_RENDER_TYPE_BY_TYPE = {
  "text-ref-character-name": "text",
  "text-revealing-ref-dialogue-content": "text-revealing",
  "text-ref-choice-item-content": "text",
  "text-ref-save-load-slot-date": "text",
  "text-ref-dialogue-line-character-name": "text",
  "text-ref-dialogue-line-content": "text",
};

const SPRITE_IMAGE_BY_TYPE = {
  "sprite-ref-save-load-slot-image": "${item.image}",
};

const SPRITE_RENDER_TYPE_BY_TYPE = {
  "sprite-ref-save-load-slot-image": "sprite",
};

const REPEATING_CONTAINER_CONFIG = {
  "container-ref-choice-item": {
    each: "item, i in choice.items",
    click: {
      payload: {
        actions: "${item.events.click.actions}",
      },
    },
  },
  "container-ref-save-load-slot": {
    each: "item, i in saveSlots",
  },
  "container-ref-dialogue-line": {
    each: "line, i in dialogue.lines",
  },
};

const SPECIAL_CONTAINER_INTERACTIONS = {
  "container-ref-confirm-dialog-ok": {
    click: {
      payload: {
        actions: "${confirmDialog.confirmActions}",
      },
    },
  },
  "container-ref-confirm-dialog-cancel": {
    click: {
      payload: {
        actions: "${confirmDialog.cancelActions}",
      },
    },
  },
};

const withInteractionEventData = (interaction, eventData) => {
  const normalizedInteraction = normalizeEngineActions(interaction);

  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return normalizedInteraction;
  }

  const payload = getInteractionPayload(normalizedInteraction);
  const nextEventData =
    payload._event && typeof payload._event === "object"
      ? {
          ...payload._event,
          ...eventData,
        }
      : { ...eventData };

  return withInteractionPayload(normalizedInteraction, {
    ...payload,
    _event: nextEventData,
  });
};

const DEFAULT_TEXT_STYLE_RESOURCE = {
  fontSize: 24,
  fontWeight: "normal",
  fontStyle: "normal",
  lineHeight: 1.2,
  breakWords: true,
};

export const BASE_LAYOUT_KEYBOARD_OPTIONS = [
  { value: "enter", label: "Enter" },
  { value: "space", label: "Space" },
  { value: "esc", label: "Escape" },
  { value: "left", label: "Left Arrow" },
  { value: "right", label: "Right Arrow" },
  { value: "up", label: "Up Arrow" },
  { value: "down", label: "Down Arrow" },
];

export const BASE_LAYOUT_KEYBOARD_LABELS = Object.fromEntries(
  BASE_LAYOUT_KEYBOARD_OPTIONS.map((item) => [item.value, item.label]),
);

const isLayoutResource = (item) => item?.type === "layout";

export const normalizeLayoutType = (layoutType) => layoutType;

export const isFragmentLayout = (layout) => layout?.isFragment === true;

export const filterLayoutsByType = (layoutsData, layoutTypes = []) => {
  const allowedLayoutTypes = new Set(layoutTypes);

  return filterTreeCollection(layoutsData, (item) => {
    if (!isLayoutResource(item)) {
      return false;
    }

    return allowedLayoutTypes.has(normalizeLayoutType(item.layoutType));
  });
};

export const filterLayoutsExcludingTypes = (
  layoutsData,
  excludedLayoutTypes = [],
) => {
  const blockedLayoutTypes = new Set(excludedLayoutTypes);

  return filterTreeCollection(layoutsData, (item) => {
    if (!isLayoutResource(item)) {
      return false;
    }

    return !blockedLayoutTypes.has(normalizeLayoutType(item.layoutType));
  });
};

const toWordWrapWidth = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toFiniteNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveTextStyleId = (nodeTextStyleId, textStylesData = {}) => {
  const textStyleItems = textStylesData.items || {};

  if (nodeTextStyleId && textStyleItems[nodeTextStyleId]) {
    return nodeTextStyleId;
  }

  return getFirstTextStyleId(textStylesData);
};

const normalizeTextStyleResource = (textStyleData) => {
  if (!textStyleData?.fontId || !textStyleData?.colorId) {
    return undefined;
  }

  const textStyle = {
    fontId: textStyleData.fontId,
    colorId: textStyleData.colorId,
    fontSize: toFiniteNumber(
      textStyleData.fontSize,
      DEFAULT_TEXT_STYLE_RESOURCE.fontSize,
    ),
    fontWeight:
      textStyleData.fontWeight ?? DEFAULT_TEXT_STYLE_RESOURCE.fontWeight,
    fontStyle: textStyleData.fontStyle ?? DEFAULT_TEXT_STYLE_RESOURCE.fontStyle,
    lineHeight: toFiniteNumber(
      textStyleData.lineHeight,
      DEFAULT_TEXT_STYLE_RESOURCE.lineHeight,
    ),
    breakWords:
      textStyleData.breakWords ?? DEFAULT_TEXT_STYLE_RESOURCE.breakWords,
  };

  if (
    typeof textStyleData.align === "string" &&
    textStyleData.align.length > 0
  ) {
    textStyle.align = textStyleData.align;
  }

  const wordWrapWidth = toWordWrapWidth(textStyleData.wordWrapWidth);
  if (wordWrapWidth !== undefined) {
    textStyle.wordWrap = textStyleData.wordWrap ?? true;
    textStyle.wordWrapWidth = wordWrapWidth;
  } else if (typeof textStyleData.wordWrap === "boolean") {
    textStyle.wordWrap = textStyleData.wordWrap;
  }

  if (textStyleData.strokeColorId) {
    textStyle.strokeColorId = textStyleData.strokeColorId;
  }
  if (textStyleData.strokeAlpha !== undefined) {
    textStyle.strokeAlpha = textStyleData.strokeAlpha;
  }
  if (textStyleData.strokeWidth !== undefined) {
    textStyle.strokeWidth = textStyleData.strokeWidth;
  }

  return textStyle;
};

const buildNodeTextStyleOverrides = (node) => {
  const overrides = {};

  if (
    typeof node.textStyle?.align === "string" &&
    node.textStyle.align.length > 0
  ) {
    overrides.align = node.textStyle.align;
  }

  const wordWrapWidth = toWordWrapWidth(node.textStyle?.wordWrapWidth);
  if (wordWrapWidth !== undefined) {
    overrides.wordWrap = true;
    overrides.wordWrapWidth = wordWrapWidth;
    overrides.breakWords = true;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
};

const ensureNodeTextStyleId = ({
  textStyles,
  textStylesData,
  layoutId,
  node,
  textStyleId,
  variant,
}) => {
  const resolvedTextStyleId = resolveTextStyleId(textStyleId, textStylesData);
  if (!resolvedTextStyleId) {
    return undefined;
  }

  const overrides = buildNodeTextStyleOverrides(node);
  if (!overrides) {
    return resolvedTextStyleId;
  }

  const derivedId = `__layout:${layoutId}:${node.id}:${variant}`;
  if (!textStyles[derivedId]) {
    const baseTextStyle = textStyles[resolvedTextStyleId];
    if (!baseTextStyle) {
      return resolvedTextStyleId;
    }

    textStyles[derivedId] = {
      ...baseTextStyle,
      ...overrides,
    };
  }

  return derivedId;
};

const normalizeSliderChange = (change, sliderId) => {
  const interactionPayload = getInteractionPayload(change);
  const updateVariable = interactionPayload?.actions?.updateVariable;
  if (!updateVariable) {
    return normalizeEngineActions(change);
  }

  const fallbackId = toAlphanumericId(`slider${sliderId}update`);
  const sanitizedId = toAlphanumericId(updateVariable.id, fallbackId);

  if (sanitizedId === updateVariable.id) {
    return normalizeEngineActions(change);
  }

  return normalizeEngineActions(
    withInteractionPayload(change, {
      ...interactionPayload,
      actions: {
        ...interactionPayload.actions,
        updateVariable: {
          ...updateVariable,
          id: sanitizedId,
        },
      },
    }),
  );
};

const mergeInteractionPayloadActions = (baseInteraction, extraInteraction) => {
  const basePayload = getInteractionPayload(baseInteraction);
  const extraPayload = getInteractionPayload(extraInteraction);
  const baseActions = getInteractionActions(baseInteraction);
  const extraActions = getInteractionActions(extraInteraction);
  let mergedActions;

  if (typeof extraActions === "string") {
    mergedActions = extraActions;
  } else if (typeof baseActions === "string") {
    mergedActions = baseActions;
  } else {
    mergedActions = {
      ...baseActions,
      ...extraActions,
    };
  }

  return normalizeEngineActions(
    withInteractionPayload(baseInteraction, {
      ...basePayload,
      ...extraPayload,
      actions: mergedActions,
    }),
  );
};

const withInheritToChildren = (interaction, inheritToChildren) => {
  if (inheritToChildren !== true) {
    return interaction;
  }

  const nextInteraction =
    interaction && typeof interaction === "object" ? { ...interaction } : {};

  return {
    ...nextInteraction,
    inheritToChildren: true,
  };
};

const updateChildrenIds = (children, indexVar) => {
  return children.map((child) => {
    const updatedChild = {
      ...child,
      id: `${child.id}-instance-\${${indexVar}}`,
    };

    if (updatedChild.children && updatedChild.children.length > 0) {
      updatedChild.children = updateChildrenIds(
        updatedChild.children,
        indexVar,
      );
    }

    return updatedChild;
  });
};

const prefixElementIds = (elements, prefix) => {
  return (elements || []).map((element) => {
    const nextElement = {
      ...element,
      id: `${prefix}--${element.id}`,
    };

    if (
      Array.isArray(nextElement.children) &&
      nextElement.children.length > 0
    ) {
      nextElement.children = prefixElementIds(nextElement.children, prefix);
    }

    return nextElement;
  });
};

const resolveFragmentChildren = ({ node, imageItems, context }) => {
  const fragmentLayoutId = node.fragmentLayoutId;
  const fragmentStack = context.fragmentStack || [];
  if (
    !fragmentLayoutId ||
    fragmentStack.includes(fragmentLayoutId) ||
    !context.layoutsData?.[fragmentLayoutId]
  ) {
    return [];
  }

  const fragmentLayout = context.layoutsData[fragmentLayoutId];
  if (fragmentLayout.type !== "layout" || !isFragmentLayout(fragmentLayout)) {
    return [];
  }

  const fragmentNodes = toHierarchyStructure(fragmentLayout.elements);
  const fragmentContext = {
    ...context,
    layoutId: fragmentLayoutId,
    fragmentStack: [...fragmentStack, fragmentLayoutId],
  };

  return prefixElementIds(
    fragmentNodes.map((child) =>
      mapLayoutNode({
        node: child,
        imageItems,
        context: fragmentContext,
      }),
    ),
    node.id,
  );
};

const isNvlLinesContainer = (node) => {
  if (node.type !== "container" || !Array.isArray(node.children)) {
    return false;
  }

  return node.children.some(
    (child) => child.type === "container-ref-dialogue-line",
  );
};

const getImageFileId = (imageItems, imageId) => {
  const fileId = imageItems?.[imageId]?.fileId;
  return typeof fileId === "string" && fileId.length > 0
    ? `${fileId}`
    : undefined;
};

const buildBaseElement = (node, context = {}) => {
  const element = {
    id: node.id,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    anchorX: node.anchorX ?? 0,
    anchorY: node.anchorY ?? 0,
    scaleX: node.scaleX ?? 1,
    scaleY: node.scaleY ?? 1,
    rotation: node.rotation ?? 0,
  };

  if (typeof node.opacity === "number") {
    element.alpha = node.opacity;
  }

  const click = withInheritToChildren(
    withInteractionEventData(node.click, context.slotEventData),
    node.inheritClickToChildren,
  );
  if (click) {
    element.click = click;
  }

  const rightClick = withInheritToChildren(
    withInteractionEventData(node.rightClick, context.slotEventData),
    node.inheritRightClickToChildren,
  );
  if (rightClick) {
    element.rightClick = rightClick;
  }

  const hover = withInheritToChildren(undefined, node.inheritHoverToChildren);
  if (hover) {
    element.hover = hover;
  }

  const parsedWhen = splitVisibilityConditionFromWhen(node["$when"]);
  const normalizedBaseWhen = parsedWhen.baseWhen;
  const normalizedVisibilityWhen = buildVisibilityConditionExpression(
    parsedWhen.visibilityCondition,
  );
  const whenExpression = mergeWhenExpressions(
    normalizedBaseWhen,
    normalizedVisibilityWhen,
    buildVisibilityConditionExpression(node.visibilityCondition),
  );
  if (whenExpression) {
    element["$when"] = whenExpression;
  }

  if (node["$each"]) {
    element["$each"] = node["$each"];
  }

  return element;
};

const getTextNodeContent = (node) => {
  if (node.content !== undefined) {
    return node.content;
  }

  return TEXT_CONTENT_BY_TYPE[node.type] ?? node.text ?? "";
};

const toTextRevealingSegments = (content) => {
  if (Array.isArray(content)) {
    return content;
  }

  return [{ text: String(content ?? "") }];
};

const applyTextNode = ({ element, node, context }) => {
  if (!TEXT_NODE_TYPES.has(node.type)) {
    return element;
  }

  const renderType = TEXT_RENDER_TYPE_BY_TYPE[node.type] ?? element.type;
  const content = getTextNodeContent(node);
  const nextElement = {
    ...element,
    type: renderType,
    text: node.text,
  };

  if (renderType === "text-revealing") {
    nextElement.content = toTextRevealingSegments(content);
  } else {
    nextElement.content = content;
  }

  const textStyleId = ensureNodeTextStyleId({
    textStyles: context.textStyles,
    textStylesData: context.textStylesData,
    layoutId: context.layoutId,
    node,
    textStyleId: node.textStyleId,
    variant: "base",
  });
  if (textStyleId) {
    nextElement.textStyleId = textStyleId;
  }

  if (node.hoverTextStyleId) {
    const hoverTextStyleId = ensureNodeTextStyleId({
      textStyles: context.textStyles,
      textStylesData: context.textStylesData,
      layoutId: context.layoutId,
      node,
      textStyleId: node.hoverTextStyleId,
      variant: "hover",
    });

    if (hoverTextStyleId) {
      nextElement.hover = {
        ...nextElement.hover,
        textStyleId: hoverTextStyleId,
      };
    }
  }

  if (node.clickTextStyleId) {
    const clickTextStyleId = ensureNodeTextStyleId({
      textStyles: context.textStyles,
      textStylesData: context.textStylesData,
      layoutId: context.layoutId,
      node,
      textStyleId: node.clickTextStyleId,
      variant: "click",
    });

    if (clickTextStyleId) {
      nextElement.click = {
        ...nextElement.click,
        textStyleId: clickTextStyleId,
      };
    }
  }

  const conditionalTextStyles = Array.isArray(node.conditionalTextStyles)
    ? node.conditionalTextStyles
    : [];

  conditionalTextStyles.forEach((rule, index) => {
    if (
      !rule ||
      typeof rule !== "object" ||
      typeof rule.textStyleId !== "string" ||
      rule.textStyleId.length === 0
    ) {
      return;
    }

    const expression = buildVisibilityConditionExpression(rule);
    if (!expression) {
      return;
    }

    const conditionalTextStyleId = ensureNodeTextStyleId({
      textStyles: context.textStyles,
      textStylesData: context.textStylesData,
      layoutId: context.layoutId,
      node,
      textStyleId: rule.textStyleId,
      variant: `conditional-${index}`,
    });

    if (!conditionalTextStyleId) {
      return;
    }

    nextElement[`$if ${expression}`] = {
      textStyleId: conditionalTextStyleId,
    };
  });

  if (node.type === "text-revealing-ref-dialogue-content") {
    nextElement.speed = "${variables._dialogueTextSpeed}";
  }

  if (renderType === "text-revealing" && node.revealEffect) {
    nextElement.revealEffect = node.revealEffect;
  }

  return nextElement;
};

const applySpriteNode = ({ element, node }) => {
  if (node.type !== "sprite" && !SPRITE_IMAGE_BY_TYPE[node.type]) {
    return element;
  }

  return {
    ...element,
    type: SPRITE_RENDER_TYPE_BY_TYPE[node.type] ?? "sprite",
    ...(SPRITE_IMAGE_BY_TYPE[node.type]
      ? { imageId: SPRITE_IMAGE_BY_TYPE[node.type] }
      : node.imageId
        ? { imageId: node.imageId }
        : {}),
    ...(node.src ? { src: node.src } : {}),
    ...(node.hoverImageId ? { hoverImageId: node.hoverImageId } : {}),
    ...(node.clickImageId ? { clickImageId: node.clickImageId } : {}),
  };
};

const applyRectNode = ({ element, node }) => {
  if (node.type !== "rect") {
    return element;
  }

  return {
    ...element,
    ...(node.fill && node.fill !== "transparent" ? { fill: node.fill } : {}),
    ...(node.border ? { border: structuredClone(node.border) } : {}),
  };
};

const applySliderNode = ({ element, node, imageItems }) => {
  if (node.type !== "slider") {
    return element;
  }

  const nextElement = {
    ...element,
    direction: node.direction ?? "horizontal",
    min: node.min ?? 0,
    max: node.max ?? 100,
    step: node.step ?? 1,
    initialValue: node.initialValue ?? 0,
  };

  if (node.thumbImageId) {
    nextElement.thumbImageId = node.thumbImageId;
  }
  if (node.barImageId) {
    nextElement.barImageId = node.barImageId;
  }
  if (node.hoverThumbImageId) {
    nextElement.hoverThumbImageId = node.hoverThumbImageId;
  }
  if (node.hoverBarImageId) {
    nextElement.hoverBarImageId = node.hoverBarImageId;
  }

  const thumbSrc = getImageFileId(imageItems, node.thumbImageId);
  if (thumbSrc) {
    nextElement.thumbSrc = thumbSrc;
  }

  const barSrc = getImageFileId(imageItems, node.barImageId);
  if (barSrc) {
    nextElement.barSrc = barSrc;
  }

  const hoverThumbSrc = getImageFileId(imageItems, node.hoverThumbImageId);
  const hoverBarSrc = getImageFileId(imageItems, node.hoverBarImageId);
  if (hoverThumbSrc || hoverBarSrc) {
    nextElement.hover = {
      ...nextElement.hover,
    };

    if (hoverThumbSrc) {
      nextElement.hover.thumbSrc = hoverThumbSrc;
    }

    if (hoverBarSrc) {
      nextElement.hover.barSrc = hoverBarSrc;
    }
  }

  if (node.change) {
    nextElement.change = normalizeSliderChange(node.change, node.id);
  }

  return nextElement;
};

const applyContainerNode = ({ element, node }) => {
  if (
    node.type !== "container" &&
    node.type !== "fragment-ref" &&
    !REPEATING_CONTAINER_CONFIG[node.type] &&
    !SPECIAL_CONTAINER_INTERACTIONS[node.type]
  ) {
    return element;
  }

  const nextElement = {
    ...element,
    direction: node.direction,
    gap: node.gap,
    containerType: node.containerType,
  };

  if (typeof node.scroll === "boolean") {
    nextElement.scroll = node.scroll;
  }

  if (node.anchorToBottom || isNvlLinesContainer(node)) {
    nextElement.anchorToBottom = true;
  }

  const repeatingConfig = REPEATING_CONTAINER_CONFIG[node.type];
  if (!repeatingConfig) {
    const specialContainerInteraction =
      SPECIAL_CONTAINER_INTERACTIONS[node.type];

    if (specialContainerInteraction) {
      return {
        ...nextElement,
        type: "container",
        click: mergeInteractionPayloadActions(
          nextElement.click,
          specialContainerInteraction.click,
        ),
      };
    }

    return node.type === "fragment-ref"
      ? {
          ...nextElement,
          type: "container",
        }
      : nextElement;
  }

  let repeatingClick = repeatingConfig.click;
  if (node.type === "container-ref-save-load-slot") {
    const actionName =
      node.layoutType === "load"
        ? "loadSaveSlot"
        : node.layoutType === "save"
          ? "saveSaveSlot"
          : undefined;

    repeatingClick = actionName
      ? {
          payload: {
            _event: {
              slotId: "${item.slotId}",
            },
            actions: {
              [actionName]: {
                slot: "_event.slotId",
              },
            },
          },
        }
      : undefined;
  }

  return {
    ...nextElement,
    type: "container",
    $each: repeatingConfig.each,
    id: `${node.id}-instance-\${i}`,
    ...(repeatingClick
      ? {
          click: mergeInteractionPayloadActions(
            nextElement.click,
            repeatingClick,
          ),
        }
      : {}),
  };
};

const mapLayoutNode = ({ node, imageItems, context }) => {
  const effectiveNode =
    node.type === "container-ref-save-load-slot"
      ? {
          ...node,
          layoutType: context.layoutType,
        }
      : node;
  let element = buildBaseElement(node, context);

  element = applyTextNode({
    element,
    node: effectiveNode,
    context,
  });
  element = applySpriteNode({ element, node: effectiveNode });
  element = applyRectNode({ element, node: effectiveNode });
  element = applySliderNode({ element, node: effectiveNode, imageItems });
  element = applyContainerNode({ element, node: effectiveNode });

  const childContext =
    effectiveNode.type === "container-ref-save-load-slot"
      ? {
          ...context,
          slotEventData: {
            slotId: "${item.slotId}",
          },
        }
      : context;

  const resolvedChildren =
    effectiveNode.type === "fragment-ref"
      ? resolveFragmentChildren({
          node: effectiveNode,
          imageItems,
          context: childContext,
        })
      : effectiveNode.children?.length > 0
        ? effectiveNode.children.map((child) =>
            mapLayoutNode({
              node: child,
              imageItems,
              context: childContext,
            }),
          )
        : [];

  if (resolvedChildren.length > 0) {
    element.children = resolvedChildren;

    if (REPEATING_CONTAINER_CONFIG[effectiveNode.type]) {
      element.children = updateChildrenIds(element.children, "i");
    }
  }

  return element;
};

const createImageResources = (imageItems = {}) => {
  const images = {};

  Object.entries(imageItems).forEach(([imageId, item]) => {
    if (!item?.fileId) {
      return;
    }

    if (item.type && item.type !== "image") {
      return;
    }

    const image = {
      fileId: `${item.fileId}`,
    };

    if (item.fileType) {
      image.fileType = item.fileType;
    }
    if (item.width !== undefined) {
      image.width = item.width;
    }
    if (item.height !== undefined) {
      image.height = item.height;
    }

    images[imageId] = image;
  });

  return images;
};

const createColorResources = (colorsData = {}) => {
  return Object.entries(colorsData.items || {}).reduce(
    (result, [colorId, item]) => {
      if (item?.type && item.type !== "color") {
        return result;
      }
      if (!item?.hex) {
        return result;
      }

      result[colorId] = {
        hex: item.hex,
      };
      return result;
    },
    {},
  );
};

const createFontResources = (fontsData = {}) => {
  return Object.entries(fontsData.items || {}).reduce(
    (result, [fontId, item]) => {
      if (item?.type && item.type !== "font") {
        return result;
      }
      if (!item?.fileId) {
        return result;
      }

      result[fontId] = {
        fileId: `${item.fileId}`,
        ...(item.fileType ? { fileType: item.fileType } : {}),
      };
      return result;
    },
    {},
  );
};

const createTextStyleResources = (textStylesData = {}) => {
  return Object.entries(textStylesData.items || {}).reduce(
    (result, [textStyleId, item]) => {
      if (item?.type && item.type !== "textStyle") {
        return result;
      }

      const textStyle = normalizeTextStyleResource(item);
      if (!textStyle) {
        return result;
      }

      result[textStyleId] = textStyle;
      return result;
    },
    {},
  );
};

export const createLayoutReferenceResources = (
  imageItems,
  textStylesData,
  colorsData,
  fontsData,
) => {
  return {
    images: createImageResources(imageItems),
    colors: createColorResources(colorsData),
    fonts: createFontResources(fontsData),
    textStyles: createTextStyleResources(textStylesData),
  };
};

export const buildLayoutElements = (
  layout,
  imageItems,
  textStylesData,
  colorsData,
  fontsData,
  options = {},
) => {
  const resources = createLayoutReferenceResources(
    imageItems,
    textStylesData,
    colorsData,
    fontsData,
  );
  const textStyles = {
    ...resources.textStyles,
  };
  const context = {
    layoutId: options.layoutId ?? "preview",
    layoutType: normalizeLayoutType(options.layoutType),
    textStylesData,
    textStyles,
    layoutsData: options.layoutsData,
    fragmentStack: options.fragmentStack ?? [],
  };

  const elements = (layout || []).map((node) =>
    mapLayoutNode({
      node,
      imageItems,
      context,
    }),
  );

  return {
    elements,
    resources: {
      ...resources,
      textStyles,
    },
  };
};

export const buildLayoutRenderElements = (
  layout,
  imageItems,
  textStylesData,
  colorsData,
  fontsData,
  options = {},
) => {
  const { elements, resources } = buildLayoutElements(
    layout,
    imageItems,
    textStylesData,
    colorsData,
    fontsData,
    options,
  );

  return resolveLayoutReferences(elements, {
    resources,
  });
};

export const extractFileIdsFromRenderState = (obj) => {
  const fileReferencesByKey = new Map();
  const defaultFileReferenceType = "image/png";

  const isRuntimeAssetReference = (value) => {
    if (typeof value !== "string" || value.length === 0) {
      return false;
    }

    return (
      value.includes("${") ||
      value.startsWith("data:") ||
      value.startsWith("blob:") ||
      value.startsWith("http://") ||
      value.startsWith("https://")
    );
  };

  const resolvePreferredFileReferenceType = (currentType, nextType) => {
    const normalizedCurrent =
      typeof currentType === "string" && currentType.length > 0
        ? currentType
        : undefined;
    const normalizedNext =
      typeof nextType === "string" && nextType.length > 0
        ? nextType
        : defaultFileReferenceType;

    if (!normalizedCurrent || normalizedCurrent === normalizedNext) {
      return normalizedNext;
    }

    if (
      normalizedCurrent === defaultFileReferenceType &&
      normalizedNext !== defaultFileReferenceType
    ) {
      return normalizedNext;
    }

    return normalizedCurrent;
  };

  const addFileReference = (fileId, type = defaultFileReferenceType) => {
    if (typeof fileId !== "string" || fileId.length === 0) {
      return;
    }

    if (isRuntimeAssetReference(fileId)) {
      return;
    }

    const existingReference = fileReferencesByKey.get(fileId);
    const preferredType = resolvePreferredFileReferenceType(
      existingReference?.type,
      type,
    );

    if (existingReference?.type === preferredType) {
      return;
    }

    fileReferencesByKey.set(fileId, {
      url: fileId,
      type: preferredType,
    });
  };

  const traverse = (value) => {
    if (value === null || value === undefined) return;

    if (typeof value === "string") {
      if (value.startsWith("file:")) {
        addFileReference(value.replace("file:", ""));
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }

    if (typeof value === "object") {
      Object.keys(value).forEach((key) => {
        if (
          (key === "fileId" ||
            key === "url" ||
            key === "src" ||
            key === "thumbSrc" ||
            key === "barSrc" ||
            key === "hoverUrl" ||
            key === "clickUrl" ||
            key === "fontFileId") &&
          typeof value[key] === "string"
        ) {
          const fileId = value[key].startsWith("file:")
            ? value[key].replace("file:", "")
            : value[key];
          addFileReference(fileId, value.fileType || "image/png");
        }
        traverse(value[key]);
      });
    }
  };

  traverse(obj);
  return Array.from(fileReferencesByKey.values());
};

const RESOURCE_REFERENCE_KEYS = new Set([
  "resourceId",
  "guiId",
  "bgmId",
  "sfxId",
  "layoutId",
  "characterId",
  "transformId",
  "textStyleId",
  "fontId",
  "fontFileId",
  "colorId",
  "strokeColorId",
  "imageId",
  "hoverImageId",
  "clickImageId",
  "thumbImageId",
  "barImageId",
  "hoverThumbImageId",
  "hoverBarImageId",
]);

const createResourceSelection = () => ({
  images: new Set(),
  videos: new Set(),
  sounds: new Set(),
  fonts: new Set(),
  colors: new Set(),
  textStyles: new Set(),
  layouts: new Set(),
  characters: new Set(),
  transforms: new Set(),
  animations: new Set(),
});

const addResourceIdToSelection = (selection, resources, resourceId) => {
  if (typeof resourceId !== "string" || resourceId.length === 0) {
    return;
  }

  if (resources.images?.[resourceId]) {
    selection.images.add(resourceId);
  }
  if (resources.videos?.[resourceId]) {
    selection.videos.add(resourceId);
  }
  if (resources.sounds?.[resourceId]) {
    selection.sounds.add(resourceId);
  }
  if (resources.fonts?.[resourceId]) {
    selection.fonts.add(resourceId);
  }
  if (resources.colors?.[resourceId]) {
    selection.colors.add(resourceId);
  }
  if (resources.textStyles?.[resourceId]) {
    selection.textStyles.add(resourceId);
  }
  if (resources.layouts?.[resourceId]) {
    selection.layouts.add(resourceId);
  }
  if (resources.characters?.[resourceId]) {
    selection.characters.add(resourceId);
  }
  if (resources.transforms?.[resourceId]) {
    selection.transforms.add(resourceId);
  }
  if (resources.animations?.[resourceId]) {
    selection.animations.add(resourceId);
  }
};

const traverseScene = (value, handleEntry) => {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      traverseScene(item, handleEntry);
    });
    return;
  }

  Object.entries(value).forEach(([key, entry]) => {
    handleEntry(key, entry);
    traverseScene(entry, handleEntry);
  });
};

const pickByIds = (items = {}, idSet) => {
  if (!idSet || idSet.size === 0) {
    return {};
  }

  return Array.from(idSet).reduce((result, id) => {
    if (items[id]) {
      result[id] = items[id];
    }
    return result;
  }, {});
};

const collectResourceSelectionFromValue = (projectData, value) => {
  const resources = projectData?.resources || {};
  const selection = createResourceSelection();
  const pendingLayoutIds = [];
  const queuedLayoutIds = new Set();
  const pendingTextStyleIds = [];
  const queuedTextStyleIds = new Set();

  const scanValue = (node) => {
    traverseScene(node, (key, entry) => {
      if (!RESOURCE_REFERENCE_KEYS.has(key) || typeof entry !== "string") {
        return;
      }

      const hadLayout = selection.layouts.has(entry);
      const hadTextStyle = selection.textStyles.has(entry);
      addResourceIdToSelection(selection, resources, entry);

      if (
        !hadLayout &&
        selection.layouts.has(entry) &&
        !queuedLayoutIds.has(entry)
      ) {
        queuedLayoutIds.add(entry);
        pendingLayoutIds.push(entry);
      }

      if (
        !hadTextStyle &&
        selection.textStyles.has(entry) &&
        !queuedTextStyleIds.has(entry)
      ) {
        queuedTextStyleIds.add(entry);
        pendingTextStyleIds.push(entry);
      }
    });
  };

  scanValue(value);

  while (pendingLayoutIds.length > 0) {
    const layoutId = pendingLayoutIds.shift();
    const layout = resources.layouts?.[layoutId];
    if (!layout) {
      continue;
    }
    scanValue(layout);
  }

  while (pendingTextStyleIds.length > 0) {
    const textStyleId = pendingTextStyleIds.shift();
    const textStyle = resources.textStyles?.[textStyleId];
    if (!textStyle) {
      continue;
    }
    scanValue(textStyle);
  }

  return selection;
};

const dedupeFileReferences = (fileReferences = []) => {
  const dedupedReferences = new Map();

  fileReferences.forEach((fileReference) => {
    const fileId = fileReference?.url;
    if (!fileId || dedupedReferences.has(fileId)) {
      return;
    }
    dedupedReferences.set(fileId, fileReference);
  });

  return Array.from(dedupedReferences.values());
};

export const extractTransitionTargetSceneIds = (projectData, sceneId) => {
  const scene = projectData?.story?.scenes?.[sceneId];
  const allScenes = projectData?.story?.scenes || {};

  if (!scene) {
    return [];
  }

  const sceneIds = new Set();

  traverseScene(scene, (key, entry) => {
    if (key !== "sectionTransition" || typeof entry !== "object" || !entry) {
      return;
    }

    if (typeof entry.sceneId !== "string" || !allScenes[entry.sceneId]) {
      return;
    }

    sceneIds.add(entry.sceneId);
  });

  return Array.from(sceneIds);
};

export const extractTransitionTargetSceneIdsFromActions = (
  actions,
  projectData,
) => {
  const allScenes = projectData?.story?.scenes || {};
  if (!actions || typeof actions !== "object") {
    return [];
  }

  const sceneIds = new Set();
  traverseScene(actions, (key, entry) => {
    if (key !== "sectionTransition" || typeof entry !== "object" || !entry) {
      return;
    }

    if (typeof entry.sceneId !== "string" || !allScenes[entry.sceneId]) {
      return;
    }

    sceneIds.add(entry.sceneId);
  });

  return Array.from(sceneIds);
};

const getValueByPath = (source, path) => {
  if (!path) {
    return source;
  }

  return path.split(".").reduce((result, segment) => {
    if (result === null || result === undefined) {
      return undefined;
    }
    return result[segment];
  }, source);
};

export const resolveEventBindings = (value, eventData) => {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveEventBindings(entry, eventData));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveEventBindings(entry, eventData),
      ]),
    );
  }
  return resolveEventBindingString(value, eventData);
};

const resolveEventBindingString = (value, eventData) => {
  if (typeof value !== "string") {
    return value;
  }
  if (value === "_event") {
    return eventData;
  }
  if (!value.startsWith("_event.")) {
    return value;
  }

  const resolvedValue = getValueByPath(
    eventData,
    value.slice("_event.".length),
  );
  return resolvedValue === undefined ? value : resolvedValue;
};

export const extractSceneIdsFromValue = (value, projectData) => {
  const allScenes = projectData?.story?.scenes || {};
  const sceneIds = new Set();

  traverseScene(value, (key, entry) => {
    if (key !== "sceneId" || typeof entry !== "string" || !allScenes[entry]) {
      return;
    }

    sceneIds.add(entry);
  });

  return Array.from(sceneIds);
};

export const extractLayoutIdsFromValue = (value, projectData) => {
  const allLayouts = projectData?.resources?.layouts || {};
  if (!value || typeof value !== "object") {
    return [];
  }

  const layoutIds = new Set();

  const scanNode = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(scanNode);
      return;
    }

    if (typeof node.layoutId === "string" && allLayouts[node.layoutId]) {
      layoutIds.add(node.layoutId);
    }

    if (
      typeof node.resourceId === "string" &&
      allLayouts[node.resourceId] &&
      (typeof node.resourceType !== "string" ||
        node.resourceType === "layout" ||
        node.resourceType === "control")
    ) {
      layoutIds.add(node.resourceId);
    }

    Object.values(node).forEach(scanNode);
  };

  scanNode(value);
  return Array.from(layoutIds);
};

export const extractFileIdsForScene = (projectData, sceneId) => {
  const scene = projectData?.story?.scenes?.[sceneId];
  const resources = projectData?.resources;

  if (!scene || !resources) {
    return [];
  }

  const selection = collectResourceSelectionFromValue(projectData, scene);
  const scopedLayouts = pickByIds(resources.layouts, selection.layouts);

  const scopedResources = {
    images: pickByIds(resources.images, selection.images),
    videos: pickByIds(resources.videos, selection.videos),
    sounds: pickByIds(resources.sounds, selection.sounds),
    fonts: pickByIds(resources.fonts, selection.fonts),
    colors: pickByIds(resources.colors, selection.colors),
    textStyles: pickByIds(resources.textStyles, selection.textStyles),
    layouts: scopedLayouts,
    characters: pickByIds(resources.characters, selection.characters),
    transforms: pickByIds(resources.transforms, selection.transforms),
    animations: pickByIds(resources.animations, selection.animations),
  };

  return dedupeFileReferences(extractFileIdsFromRenderState(scopedResources));
};

export const extractFileIdsForLayouts = (projectData, layoutIds = []) => {
  const resources = projectData?.resources;
  if (!resources || !Array.isArray(layoutIds) || layoutIds.length === 0) {
    return [];
  }

  const validLayoutIds = new Set(
    layoutIds.filter((layoutId) => typeof layoutId === "string" && layoutId),
  );
  const scopedLayouts = pickByIds(resources.layouts, validLayoutIds);

  if (Object.keys(scopedLayouts).length === 0) {
    return [];
  }

  const selection = collectResourceSelectionFromValue(
    projectData,
    scopedLayouts,
  );
  const scopedResources = {
    images: pickByIds(resources.images, selection.images),
    videos: pickByIds(resources.videos, selection.videos),
    sounds: pickByIds(resources.sounds, selection.sounds),
    layouts: scopedLayouts,
    fonts: pickByIds(resources.fonts, selection.fonts),
    colors: pickByIds(resources.colors, selection.colors),
    textStyles: pickByIds(resources.textStyles, selection.textStyles),
  };

  return dedupeFileReferences(extractFileIdsFromRenderState(scopedResources));
};

export const extractFileIdsForScenes = (projectData, sceneIds = []) => {
  return dedupeFileReferences(
    sceneIds.flatMap((sceneId) => extractFileIdsForScene(projectData, sceneId)),
  );
};

export const extractInitialHybridSceneIds = (projectData, sceneId) => {
  if (!sceneId) {
    return [];
  }

  const relatedSceneIds = [
    sceneId,
    ...extractTransitionTargetSceneIds(projectData, sceneId),
  ];
  return Array.from(new Set(relatedSceneIds));
};

const asKeyboardMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value;
};

const KEYBOARD_KEY_CANONICAL_MAP = {
  enter: "enter",
  space: "space",
  esc: "escape",
  escape: "escape",
  left: "arrowleft",
  arrowleft: "arrowleft",
  right: "arrowright",
  arrowright: "arrowright",
  up: "arrowup",
  arrowup: "arrowup",
  down: "arrowdown",
  arrowdown: "arrowdown",
};

const normalizeKeyboardKeyForGraphics = (key) => {
  return KEYBOARD_KEY_CANONICAL_MAP[key] ?? key;
};

export const getLayoutKeyboardResourceId = (layoutId) => {
  return `layout-keyboard:${layoutId}`;
};

export const toRouteEngineKeyboardResource = (keyboardMap) => {
  const input = asKeyboardMap(keyboardMap);
  if (!input) {
    return {};
  }

  const resource = {};
  Object.entries(input).forEach(([key, interaction]) => {
    const actions = getInteractionActions(interaction);
    resource[normalizeKeyboardKeyForGraphics(key)] = {
      actions: structuredClone(actions),
    };
  });

  return resource;
};

export const prepareRenderStateKeyboardForGraphics = ({
  renderState,
  enableGlobalKeyboardBindings = true,
}) => {
  const existingGlobal =
    renderState?.global && typeof renderState.global === "object"
      ? renderState.global
      : {};
  const existingKeyboard = asKeyboardMap(existingGlobal.keyboard);

  if (!enableGlobalKeyboardBindings) {
    if (!existingKeyboard) {
      return renderState;
    }

    return {
      ...renderState,
      global: {
        ...existingGlobal,
        keyboard: undefined,
      },
    };
  }

  if (!existingKeyboard) {
    return renderState;
  }

  const normalizedKeyboard = {};
  Object.entries(existingKeyboard).forEach(([key, value]) => {
    normalizedKeyboard[normalizeKeyboardKeyForGraphics(key)] = {
      payload: structuredClone(value?.payload ?? {}),
    };
  });

  return {
    ...renderState,
    global: {
      ...existingGlobal,
      keyboard: normalizedKeyboard,
    },
  };
};

export const layoutHierarchyStructureToRenderState = (
  layout,
  imageItems,
  textStylesData,
  colorsData,
  fontsData,
  options = {},
) => {
  return buildLayoutRenderElements(
    layout,
    imageItems,
    textStylesData,
    colorsData,
    fontsData,
    options,
  );
};
