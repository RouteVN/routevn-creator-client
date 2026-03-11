import { getFirstTypographyId } from "../../constants/typography.js";

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

const DEFAULT_TEXT_STYLE = {
  fontSize: 24,
  fontFamily: "sans-serif",
  fontWeight: "normal",
  fill: "white",
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

const resolveTypographyForNode = (nodeTypographyId, typographyData = {}) => {
  const typographyItems = typographyData.items || {};

  if (nodeTypographyId && typographyItems[nodeTypographyId]) {
    return typographyItems[nodeTypographyId];
  }

  const firstTypographyId = getFirstTypographyId(typographyData);
  return firstTypographyId ? typographyItems[firstTypographyId] : undefined;
};

const normalizeSliderChange = (change, sliderId) => {
  const updateVariable = change?.actionPayload?.actions?.updateVariable;
  if (!updateVariable) {
    return change;
  }

  const fallbackId = toAlphanumericId(`slider${sliderId}update`);
  const sanitizedId = toAlphanumericId(updateVariable.id, fallbackId);

  if (sanitizedId === updateVariable.id) {
    return change;
  }

  return {
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
  };
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
    click: node.click,
  };

  if (node["$when"]) {
    element["$when"] = node["$when"];
  }

  if (node["$each"]) {
    element["$each"] = node["$each"];
  }

  return element;
};

const buildTextStyle = ({
  node,
  typography,
  colorsData,
  fontsData,
  fallbackStyle = DEFAULT_TEXT_STYLE,
}) => {
  const colorItem = colorsData.items?.[typography?.colorId];
  const fontItem = fontsData.items?.[typography?.fontId];
  const fontSize =
    Number.parseFloat(typography?.fontSize ?? fallbackStyle.fontSize ?? 24) ||
    24;
  const lineHeightRatio =
    Number.parseFloat(
      typography?.lineHeight ?? fallbackStyle.lineHeight ?? 1.2,
    ) || 1.2;
  const wordWrapWidth = toWordWrapWidth(node.style?.wordWrapWidth);

  return {
    fontSize,
    fontFamily:
      fontItem?.fontFamily || fallbackStyle.fontFamily || "sans-serif",
    fontWeight: typography?.fontWeight || fallbackStyle.fontWeight || "normal",
    fill: colorItem?.hex || fallbackStyle.fill || "white",
    lineHeight:
      fallbackStyle === DEFAULT_TEXT_STYLE
        ? (typography?.lineHeight ?? fallbackStyle.lineHeight ?? 1.2)
        : Math.round(fontSize * lineHeightRatio),
    align: node.style?.align,
    breakWords: true,
    ...(wordWrapWidth !== undefined ? { wordWrapWidth } : {}),
  };
};

const applyTextNode = ({
  element,
  node,
  typographyData,
  colorsData,
  fontsData,
}) => {
  if (!TEXT_NODE_TYPES.has(node.type)) {
    return element;
  }

  const typography = resolveTypographyForNode(
    node.typographyId,
    typographyData,
  );
  const wordWrapWidth = toWordWrapWidth(node.style?.wordWrapWidth);
  const baseTextStyle = typography
    ? buildTextStyle({
        node,
        typography,
        colorsData,
        fontsData,
      })
    : {
        ...DEFAULT_TEXT_STYLE,
        align: node.style?.align,
        ...(wordWrapWidth !== undefined ? { wordWrapWidth } : {}),
      };

  const nextElement = {
    ...element,
    type: TEXT_RENDER_TYPE_BY_TYPE[node.type] || element.type,
    text: node.text,
    content: TEXT_CONTENT_BY_TYPE[node.type] || node.text,
    textStyle: baseTextStyle,
  };

  if (node.hoverTypographyId) {
    const hoverTypography = typographyData.items?.[node.hoverTypographyId];
    if (hoverTypography) {
      nextElement.hover = {
        textStyle: buildTextStyle({
          node,
          typography: hoverTypography,
          colorsData,
          fontsData,
          fallbackStyle: baseTextStyle,
        }),
      };
    }
  }

  if (node.clickedTypographyId) {
    const clickedTypography = typographyData.items?.[node.clickedTypographyId];
    if (clickedTypography) {
      nextElement.click = {
        ...nextElement.click,
        textStyle: buildTextStyle({
          node,
          typography: clickedTypography,
          colorsData,
          fontsData,
          fallbackStyle: baseTextStyle,
        }),
      };
    }
  }

  return nextElement;
};

const applySpriteNode = ({ element, node, imageItems }) => {
  if (node.type !== "sprite") {
    return element;
  }

  const nextElement = { ...element };

  const image = imageItems?.[node.imageId];
  if (image?.fileId) {
    nextElement.src = `${image.fileId}`;
  }

  const hoverImage = imageItems?.[node.hoverImageId];
  if (hoverImage?.fileId) {
    nextElement.hover = {
      ...nextElement.hover,
      src: `${hoverImage.fileId}`,
    };
  }

  const clickImage = imageItems?.[node.clickImageId];
  if (clickImage?.fileId) {
    nextElement.click = {
      ...nextElement.click,
      src: `${clickImage.fileId}`,
    };
  }

  return nextElement;
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

  const thumbImage = imageItems?.[node.thumbImageId];
  if (thumbImage?.fileId) {
    nextElement.thumbSrc = `${thumbImage.fileId}`;
  }

  const barImage = imageItems?.[node.barImageId];
  if (barImage?.fileId) {
    nextElement.barSrc = `${barImage.fileId}`;
  }

  const hoverThumbImage = imageItems?.[node.hoverThumbImageId];
  const hoverBarImage = imageItems?.[node.hoverBarImageId];
  if (hoverThumbImage?.fileId || hoverBarImage?.fileId) {
    nextElement.hover = {
      ...nextElement.hover,
    };

    if (hoverThumbImage?.fileId) {
      nextElement.hover.thumbSrc = `${hoverThumbImage.fileId}`;
    }

    if (hoverBarImage?.fileId) {
      nextElement.hover.barSrc = `${hoverBarImage.fileId}`;
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
            ...repeatingConfig.click,
          },
        }
      : {}),
  };
};

const mapLayoutNode = ({
  node,
  imageItems,
  typographyData,
  colorsData,
  fontsData,
}) => {
  let element = buildBaseElement(node);

  element = applyTextNode({
    element,
    node,
    typographyData,
    colorsData,
    fontsData,
  });
  element = applySpriteNode({ element, node, imageItems });
  element = applySliderNode({ element, node, imageItems });
  element = applyContainerNode({ element, node });

  if (node.children?.length > 0) {
    element.children = node.children.map((child) =>
      mapLayoutNode({
        node: child,
        imageItems,
        typographyData,
        colorsData,
        fontsData,
      }),
    );

    if (REPEATING_CONTAINER_CONFIG[node.type]) {
      element.children = updateChildrenIds(element.children, "i");
    }
  }

  return element;
};

export const buildLayoutRenderElements = (
  layout,
  imageItems,
  typographyData,
  colorsData,
  fontsData,
) => {
  return layout.map((node) =>
    mapLayoutNode({
      node,
      imageItems,
      typographyData,
      colorsData,
      fontsData,
    }),
  );
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
  "fontId",
  "fontFileId",
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
  layouts: new Set(),
  characters: new Set(),
  transforms: new Set(),
  tweens: new Set(),
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
  if (resources.layouts?.[resourceId]) {
    selection.layouts.add(resourceId);
  }
  if (resources.characters?.[resourceId]) {
    selection.characters.add(resourceId);
  }
  if (resources.transforms?.[resourceId]) {
    selection.transforms.add(resourceId);
  }
  if (resources.tweens?.[resourceId]) {
    selection.tweens.add(resourceId);
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

const pickFontsByFamily = (fonts = {}, fontFamilySet) => {
  if (!fontFamilySet || fontFamilySet.size === 0) {
    return {};
  }

  return Object.entries(fonts).reduce((result, [fontId, font]) => {
    if (
      typeof font?.fontFamily === "string" &&
      fontFamilySet.has(font.fontFamily)
    ) {
      result[fontId] = font;
    }
    return result;
  }, {});
};

const collectFontFamilies = (value, fontFamilies = new Set()) => {
  if (!value || typeof value !== "object") {
    return fontFamilies;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      collectFontFamilies(entry, fontFamilies);
    });
    return fontFamilies;
  }

  Object.entries(value).forEach(([key, entry]) => {
    if (key === "fontFamily" && typeof entry === "string" && entry.length > 0) {
      fontFamilies.add(entry);
      return;
    }
    collectFontFamilies(entry, fontFamilies);
  });

  return fontFamilies;
};

const mergeObjects = (...objects) => {
  return objects.reduce((result, object) => {
    return {
      ...result,
      ...object,
    };
  }, {});
};

const collectResourceSelectionFromValue = (projectData, value) => {
  const resources = projectData?.resources || {};
  const selection = createResourceSelection();
  const pendingLayoutIds = [];
  const queuedLayoutIds = new Set();

  const scanValue = (node) => {
    traverseScene(node, (key, entry) => {
      if (!RESOURCE_REFERENCE_KEYS.has(key) || typeof entry !== "string") {
        return;
      }

      const hadLayout = selection.layouts.has(entry);
      addResourceIdToSelection(selection, resources, entry);

      if (
        !hadLayout &&
        selection.layouts.has(entry) &&
        !queuedLayoutIds.has(entry)
      ) {
        queuedLayoutIds.add(entry);
        pendingLayoutIds.push(entry);
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
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveEventBindings(entry, eventData));
  }

  return Object.entries(value).reduce((result, [key, entry]) => {
    if (typeof entry === "string") {
      if (!entry.startsWith("_event.")) {
        result[key] = entry;
        return result;
      }

      result[key] = getValueByPath(eventData, entry.slice("_event.".length));
      return result;
    }

    result[key] = resolveEventBindings(entry, eventData);
    return result;
  }, {});
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
  const layoutIds = new Set();

  traverseScene(value, (key, entry) => {
    if (
      key !== "resourceId" ||
      typeof entry !== "string" ||
      !allLayouts[entry]
    ) {
      return;
    }

    layoutIds.add(entry);
  });

  return Array.from(layoutIds);
};

export const extractFileIdsForScene = (projectData, sceneId) => {
  const scene = projectData?.story?.scenes?.[sceneId];
  const resources = projectData?.resources;

  if (!scene || !resources) {
    return [];
  }

  const selection = collectResourceSelectionFromValue(projectData, scene);
  const fontFamilies = collectFontFamilies(
    mergeObjects(
      pickByIds(resources.layouts, selection.layouts),
      pickByIds(resources.typography, selection.typography),
    ),
  );

  return dedupeFileReferences([
    ...extractFileIdsFromRenderState(pickByIds(resources.images, selection.images)),
    ...extractFileIdsFromRenderState(pickByIds(resources.videos, selection.videos)),
    ...extractFileIdsFromRenderState(pickByIds(resources.sounds, selection.sounds)),
    ...extractFileIdsFromRenderState(
      pickFontsByFamily(resources.fonts, fontFamilies),
    ),
    ...extractFileIdsFromRenderState(pickByIds(resources.layouts, selection.layouts)),
    ...extractFileIdsFromRenderState(
      pickByIds(resources.transforms, selection.transforms),
    ),
    ...extractFileIdsFromRenderState(
      pickByIds(resources.characters, selection.characters),
    ),
  ]);
};

export const extractFileIdsForLayouts = (projectData, layoutIds = []) => {
  const resources = projectData?.resources;
  if (!resources || layoutIds.length === 0) {
    return [];
  }

  const selection = createResourceSelection();
  layoutIds.forEach((layoutId) => {
    if (!resources.layouts?.[layoutId]) {
      return;
    }

    selection.layouts.add(layoutId);
    const layoutSelection = collectResourceSelectionFromValue(
      projectData,
      resources.layouts[layoutId],
    );

    Object.keys(selection).forEach((key) => {
      layoutSelection[key].forEach((id) => selection[key].add(id));
    });
  });

  const fontFamilies = collectFontFamilies(
    mergeObjects(
      pickByIds(resources.layouts, selection.layouts),
      pickByIds(resources.typography, selection.typography),
    ),
  );

  return dedupeFileReferences([
    ...extractFileIdsFromRenderState(pickByIds(resources.images, selection.images)),
    ...extractFileIdsFromRenderState(pickByIds(resources.videos, selection.videos)),
    ...extractFileIdsFromRenderState(pickByIds(resources.sounds, selection.sounds)),
    ...extractFileIdsFromRenderState(
      pickFontsByFamily(resources.fonts, fontFamilies),
    ),
    ...extractFileIdsFromRenderState(pickByIds(resources.layouts, selection.layouts)),
    ...extractFileIdsFromRenderState(
      pickByIds(resources.transforms, selection.transforms),
    ),
    ...extractFileIdsFromRenderState(
      pickByIds(resources.characters, selection.characters),
    ),
  ]);
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

  return [
    sceneId,
    ...extractTransitionTargetSceneIds(projectData, sceneId),
  ];
};

export const layoutHierarchyStructureToRenderState = (
  layout,
  imageItems,
  typographyData,
  colorsData,
  fontsData,
) => {
  return buildLayoutRenderElements(
    layout,
    imageItems,
    typographyData,
    colorsData,
    fontsData,
  );
};
