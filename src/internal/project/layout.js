import { resolveLayoutReferences } from "route-engine-js";
import { getFirstTextStyleId } from "../../constants/textStyles.js";
import { normalizeEngineActions } from "./engineActions.js";
import {
  getInteractionPayload,
  withInteractionPayload,
} from "./interactionPayload.js";

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
      payload: {
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
    return toRouteGraphicsInteraction(change);
  }

  const fallbackId = toAlphanumericId(`slider${sliderId}update`);
  const sanitizedId = toAlphanumericId(updateVariable.id, fallbackId);

  if (sanitizedId === updateVariable.id) {
    return toRouteGraphicsInteraction(change);
  }

  return toRouteGraphicsInteraction(
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

const toRouteGraphicsInteraction = (interaction) => {
  if (!interaction || typeof interaction !== "object") {
    return interaction;
  }

  const payload = getInteractionPayload(interaction);
  const nextInteraction = {
    ...interaction,
    actionPayload: payload,
  };

  delete nextInteraction.payload;

  return normalizeEngineActions(nextInteraction);
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
    click: toRouteGraphicsInteraction(node.click),
    rightClick: toRouteGraphicsInteraction(node.rightClick),
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
            ...toRouteGraphicsInteraction(repeatingConfig.click),
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
    textStylesData,
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

  const addFileReference = (fileId, type = "image/png") => {
    if (typeof fileId !== "string" || fileId.length === 0) {
      return;
    }

    const key = `${type}:${fileId}`;
    if (fileReferencesByKey.has(key)) {
      return;
    }

    fileReferencesByKey.set(key, {
      url: fileId,
      type,
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
      (typeof node.resourceType !== "string" || node.resourceType === "layout")
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

export const layoutHierarchyStructureToRenderState = (
  layout,
  imageItems,
  textStylesData,
  colorsData,
  fontsData,
) => {
  return buildLayoutRenderElements(
    layout,
    imageItems,
    textStylesData,
    colorsData,
    fontsData,
  );
};
