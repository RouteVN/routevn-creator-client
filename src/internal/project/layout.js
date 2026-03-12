import { resolveLayoutReferences } from "route-engine-js";
import { getFirstTypographyId } from "../../constants/typography.js";
import { normalizeEngineActions } from "./engineActions.js";

const TEXT_NODE_TYPES = new Set([
  "text",
  "text-revealing",
  "text-ref-character-name",
  "text-revealing-ref-dialogue-content",
  "text-ref-choice-item-content",
  "text-ref-dialogue-line-character-name",
  "text-ref-dialogue-line-content",
]);

const TEXT_CONTENT_BY_TYPE = {
  "text-ref-character-name": "${dialogue.character.name}",
  "text-revealing-ref-dialogue-content": "${dialogue.content[0].text}",
  "text-ref-choice-item-content": "${item.content}",
  "text-ref-dialogue-line-character-name": "${line.characterName}",
  "text-ref-dialogue-line-content": "${line.content[0].text}",
};

const TEXT_RENDER_TYPE_BY_TYPE = {
  "text-ref-character-name": "text",
  "text-revealing-ref-dialogue-content": "text",
  "text-ref-choice-item-content": "text",
  "text-ref-dialogue-line-character-name": "text",
  "text-ref-dialogue-line-content": "text",
};

const REPEATING_CONTAINER_CONFIG = {
  "container-ref-choice-item": {
    each: "item, i in choice.items",
    click: {
      actionPayload: {
        actions: "${item.events.click.actions}",
      },
    },
  },
  "container-ref-dialogue-line": {
    each: "line, i in dialogue.lines",
  },
};

const DEFAULT_TEXT_STYLE_RESOURCE = {
  fontSize: 24,
  fontWeight: "normal",
  fontStyle: "normal",
  lineHeight: 1.2,
  breakWords: true,
};

const toAlphanumericId = (value, fallback = "sliderUpdate") => {
  const sanitized = String(value || "").replace(/[^a-zA-Z0-9]/g, "");
  return sanitized || fallback;
};

const toWordWrapWidth = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toFiniteNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveTypographyId = (nodeTypographyId, typographyData = {}) => {
  const typographyItems = typographyData.items || {};

  if (nodeTypographyId && typographyItems[nodeTypographyId]) {
    return nodeTypographyId;
  }

  return getFirstTypographyId(typographyData);
};

const normalizeTextStyleResource = (typography) => {
  if (!typography?.fontId || !typography?.colorId) {
    return undefined;
  }

  const textStyle = {
    fontId: typography.fontId,
    colorId: typography.colorId,
    fontSize: toFiniteNumber(
      typography.fontSize,
      DEFAULT_TEXT_STYLE_RESOURCE.fontSize,
    ),
    fontWeight: typography.fontWeight ?? DEFAULT_TEXT_STYLE_RESOURCE.fontWeight,
    fontStyle: typography.fontStyle ?? DEFAULT_TEXT_STYLE_RESOURCE.fontStyle,
    lineHeight: toFiniteNumber(
      typography.lineHeight,
      DEFAULT_TEXT_STYLE_RESOURCE.lineHeight,
    ),
    breakWords: typography.breakWords ?? DEFAULT_TEXT_STYLE_RESOURCE.breakWords,
  };

  if (typeof typography.align === "string" && typography.align.length > 0) {
    textStyle.align = typography.align;
  }

  const wordWrapWidth = toWordWrapWidth(typography.wordWrapWidth);
  if (wordWrapWidth !== undefined) {
    textStyle.wordWrap = typography.wordWrap ?? true;
    textStyle.wordWrapWidth = wordWrapWidth;
  } else if (typeof typography.wordWrap === "boolean") {
    textStyle.wordWrap = typography.wordWrap;
  }

  if (typography.strokeColorId) {
    textStyle.strokeColorId = typography.strokeColorId;
  }
  if (typography.strokeAlpha !== undefined) {
    textStyle.strokeAlpha = typography.strokeAlpha;
  }
  if (typography.strokeWidth !== undefined) {
    textStyle.strokeWidth = typography.strokeWidth;
  }

  return textStyle;
};

const buildNodeTextStyleOverrides = (node) => {
  const overrides = {};

  if (typeof node.style?.align === "string" && node.style.align.length > 0) {
    overrides.align = node.style.align;
  }

  const wordWrapWidth = toWordWrapWidth(node.style?.wordWrapWidth);
  if (wordWrapWidth !== undefined) {
    overrides.wordWrap = true;
    overrides.wordWrapWidth = wordWrapWidth;
    overrides.breakWords = true;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
};

const ensureNodeTextStyleId = ({
  textStyles,
  typographyData,
  layoutId,
  node,
  typographyId,
  variant,
}) => {
  const resolvedTypographyId = resolveTypographyId(
    typographyId,
    typographyData,
  );
  if (!resolvedTypographyId) {
    return undefined;
  }

  const overrides = buildNodeTextStyleOverrides(node);
  if (!overrides) {
    return resolvedTypographyId;
  }

  const derivedId = `__layout:${layoutId}:${node.id}:${variant}`;
  if (!textStyles[derivedId]) {
    const baseTextStyle = textStyles[resolvedTypographyId];
    if (!baseTextStyle) {
      return resolvedTypographyId;
    }

    textStyles[derivedId] = {
      ...baseTextStyle,
      ...overrides,
    };
  }

  return derivedId;
};

const normalizeSliderChange = (change, sliderId) => {
  const updateVariable = change?.actionPayload?.actions?.updateVariable;
  if (!updateVariable) {
    return normalizeEngineActions(change);
  }

  const fallbackId = toAlphanumericId(`slider${sliderId}update`);
  const sanitizedId = toAlphanumericId(updateVariable.id, fallbackId);

  if (sanitizedId === updateVariable.id) {
    return normalizeEngineActions(change);
  }

  return normalizeEngineActions({
    ...change,
    actionPayload: {
      ...change.actionPayload,
      actions: {
        ...change.actionPayload.actions,
        updateVariable: {
          ...updateVariable,
          id: sanitizedId,
        },
      },
    },
  });
};

const updateChildrenIds = (children, indexVar) => {
  return children.map((child) => {
    const updatedChild = {
      ...child,
      id: `${child.id}-\${${indexVar}}`,
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

const buildBaseElement = (node) => {
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
    click: normalizeEngineActions(node.click),
  };

  if (node["$when"]) {
    element["$when"] = node["$when"];
  }

  if (node["$each"]) {
    element["$each"] = node["$each"];
  }

  return element;
};

const applyTextNode = ({ element, node, context }) => {
  if (!TEXT_NODE_TYPES.has(node.type)) {
    return element;
  }

  const nextElement = {
    ...element,
    type: TEXT_RENDER_TYPE_BY_TYPE[node.type] || element.type,
    text: node.text,
    content: TEXT_CONTENT_BY_TYPE[node.type] || node.text,
  };

  const textStyleId = ensureNodeTextStyleId({
    textStyles: context.textStyles,
    typographyData: context.typographyData,
    layoutId: context.layoutId,
    node,
    typographyId: node.typographyId,
    variant: "base",
  });
  if (textStyleId) {
    nextElement.textStyleId = textStyleId;
  }

  if (node.hoverTypographyId) {
    const hoverTextStyleId = ensureNodeTextStyleId({
      textStyles: context.textStyles,
      typographyData: context.typographyData,
      layoutId: context.layoutId,
      node,
      typographyId: node.hoverTypographyId,
      variant: "hover",
    });

    if (hoverTextStyleId) {
      nextElement.hover = {
        ...nextElement.hover,
        textStyleId: hoverTextStyleId,
      };
    }
  }

  if (node.clickedTypographyId) {
    const clickTextStyleId = ensureNodeTextStyleId({
      textStyles: context.textStyles,
      typographyData: context.typographyData,
      layoutId: context.layoutId,
      node,
      typographyId: node.clickedTypographyId,
      variant: "click",
    });

    if (clickTextStyleId) {
      nextElement.click = {
        ...nextElement.click,
        textStyleId: clickTextStyleId,
      };
    }
  }

  return nextElement;
};

const applySpriteNode = ({ element, node }) => {
  if (node.type !== "sprite") {
    return element;
  }

  return {
    ...element,
    ...(node.imageId ? { imageId: node.imageId } : {}),
    ...(node.hoverImageId ? { hoverImageId: node.hoverImageId } : {}),
    ...(node.clickImageId ? { clickImageId: node.clickImageId } : {}),
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
  if (node.type !== "container" && !REPEATING_CONTAINER_CONFIG[node.type]) {
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
    return nextElement;
  }

  return {
    ...nextElement,
    type: "container",
    $each: repeatingConfig.each,
    id: `${node.id}-\${i}`,
    ...(repeatingConfig.click
      ? {
          click: {
            ...nextElement.click,
            ...normalizeEngineActions(repeatingConfig.click),
          },
        }
      : {}),
  };
};

const mapLayoutNode = ({ node, imageItems, context }) => {
  let element = buildBaseElement(node);

  element = applyTextNode({
    element,
    node,
    context,
  });
  element = applySpriteNode({ element, node });
  element = applySliderNode({ element, node, imageItems });
  element = applyContainerNode({ element, node });

  if (node.children?.length > 0) {
    element.children = node.children.map((child) =>
      mapLayoutNode({
        node: child,
        imageItems,
        context,
      }),
    );

    if (REPEATING_CONTAINER_CONFIG[node.type]) {
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

const createTextStyleResources = (typographyData = {}) => {
  return Object.entries(typographyData.items || {}).reduce(
    (result, [typographyId, item]) => {
      if (item?.type && item.type !== "typography") {
        return result;
      }

      const textStyle = normalizeTextStyleResource(item);
      if (!textStyle) {
        return result;
      }

      result[typographyId] = textStyle;
      return result;
    },
    {},
  );
};

export const createLayoutReferenceResources = (
  imageItems,
  typographyData,
  colorsData,
  fontsData,
) => {
  return {
    images: createImageResources(imageItems),
    colors: createColorResources(colorsData),
    fonts: createFontResources(fontsData),
    textStyles: createTextStyleResources(typographyData),
  };
};

export const buildLayoutElements = (
  layout,
  imageItems,
  typographyData,
  colorsData,
  fontsData,
  options = {},
) => {
  const resources = createLayoutReferenceResources(
    imageItems,
    typographyData,
    colorsData,
    fontsData,
  );
  const textStyles = {
    ...resources.textStyles,
  };
  const context = {
    layoutId: options.layoutId ?? "preview",
    typographyData,
    textStyles,
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
  typographyData,
  colorsData,
  fontsData,
  options = {},
) => {
  const { elements, resources } = buildLayoutElements(
    layout,
    imageItems,
    typographyData,
    colorsData,
    fontsData,
    options,
  );

  return resolveLayoutReferences(elements, {
    resources,
  });
};
