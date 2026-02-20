import { getFirstTypographyId } from "../constants/typography.js";

export const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

export const extractFileIdsFromRenderState = (obj) => {
  const fileIds = new Set();

  function traverse(value) {
    if (value === null || value === undefined) return;

    if (typeof value === "string") {
      // Check if this is a fileId (starts with 'file:')
      if (value.startsWith("file:")) {
        fileIds.add({
          url: value.replace("file:", ""),
          type: value.fileType || "image/png",
        });
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(traverse);
      return;
    }

    if (typeof value === "object") {
      Object.keys(value).forEach((key) => {
        // Check if this property contains file references and extract fileId
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
          fileIds.add({
            url: fileId,
            type: value.fileType || "image/png",
          });
        }
        // Continue traversing nested objects
        traverse(value[key]);
      });
    }
  }

  traverse(obj);
  return Array.from(fileIds);
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

export const extractSceneIdsFromValue = (value, projectData) => {
  const allScenes = projectData?.story?.scenes || {};
  if (!value || typeof value !== "object") {
    return [];
  }

  const sceneIds = new Set();
  traverseScene(value, (key, entry) => {
    if (key !== "sceneId" || typeof entry !== "string") {
      return;
    }
    if (!allScenes[entry]) {
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
  const scopedFontsById = pickByIds(resources.fonts, selection.fonts);
  const scopedFontsByFamily = pickFontsByFamily(
    resources.fonts,
    collectFontFamilies(scopedLayouts),
  );

  const scopedResources = {
    images: pickByIds(resources.images, selection.images),
    videos: pickByIds(resources.videos, selection.videos),
    sounds: pickByIds(resources.sounds, selection.sounds),
    fonts: mergeObjects(scopedFontsByFamily, scopedFontsById),
    layouts: scopedLayouts,
    characters: pickByIds(resources.characters, selection.characters),
    transforms: pickByIds(resources.transforms, selection.transforms),
    tweens: pickByIds(resources.tweens, selection.tweens),
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

  const scopedFontsByFamily = pickFontsByFamily(
    resources.fonts,
    collectFontFamilies(scopedLayouts),
  );
  const scopedResources = {
    layouts: scopedLayouts,
    fonts: scopedFontsByFamily,
  };

  return dedupeFileReferences(extractFileIdsFromRenderState(scopedResources));
};

export const extractFileIdsForScenes = (projectData, sceneIds = []) => {
  if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
    return [];
  }

  const fileReferences = sceneIds.flatMap((sceneId) =>
    extractFileIdsForScene(projectData, sceneId),
  );
  return dedupeFileReferences(fileReferences);
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

export const layoutTreeStructureToRenderState = (
  layout,
  imageItems,
  typographyData,
  colorsData,
  fontsData,
) => {
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

  const mapNode = (node) => {
    let element = {
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

    if (
      [
        "text",
        "text-revealing",
        "text-ref-character-name",
        "text-revealing-ref-dialogue-content",
        "text-ref-choice-item-content",
      ].includes(node.type)
    ) {
      let textStyle = {};
      const wordWrapWidth = toWordWrapWidth(node.style?.wordWrapWidth);

      const typography = resolveTypographyForNode(
        node.typographyId,
        typographyData,
      );

      // Apply typography if selected
      if (typography) {
        const colorItem = colorsData.items?.[typography.colorId];
        const fontItem = fontsData.items?.[typography.fontId];

        textStyle = {
          fontSize: typography.fontSize || 24,
          fontFamily: fontItem?.fontFamily || "sans-serif",
          fontWeight: typography.fontWeight || "normal",
          fill: colorItem?.hex || "white",
          lineHeight: typography.lineHeight || 1.2,
          breakWords: true,
          align: node.style?.align,
        };
      } else {
        // Use default settings
        textStyle = {
          fontSize: 24,
          fontFamily: "sans-serif",
          fontWeight: "normal",
          fill: "white",
          lineHeight: 1.2,
          align: node.style?.align,
          breakWords: true,
        };
      }

      const finalStyle = {
        ...textStyle,
        ...(wordWrapWidth !== undefined ? { wordWrapWidth } : {}),
      };

      // Handle interaction styles
      const interactionStyles = {};

      const buildInteractionStyle = (typography) => {
        const colorItem = colorsData.items?.[typography.colorId];
        const fontItem = fontsData.items?.[typography.fontId];
        const parsedFontSize = Number.parseFloat(
          typography.fontSize ?? textStyle.fontSize ?? 24,
        );
        const fontSize = Number.isFinite(parsedFontSize) ? parsedFontSize : 24;
        const parsedLineHeightRatio = Number.parseFloat(
          typography.lineHeight ?? textStyle.lineHeight ?? 1.2,
        );
        const lineHeightRatio = Number.isFinite(parsedLineHeightRatio)
          ? parsedLineHeightRatio
          : 1.2;

        return {
          fontSize,
          fontFamily:
            fontItem?.fontFamily || textStyle.fontFamily || "sans-serif",
          fontWeight: typography.fontWeight || textStyle.fontWeight || "normal",
          fill: colorItem?.hex || textStyle.fill || "white",
          // Hover/click styles are applied directly by route-graphics (not parseText),
          // so lineHeight must be in pixels to match base text metrics.
          lineHeight: Math.round(fontSize * lineHeightRatio),
          align: node.style?.align,
          breakWords: true,
          ...(wordWrapWidth !== undefined ? { wordWrapWidth } : {}),
        };
      };

      // Process hover style
      if (node.hoverTypographyId) {
        const hoverTypography = typographyData.items[node.hoverTypographyId];
        if (hoverTypography) {
          interactionStyles.hover = {
            textStyle: buildInteractionStyle(hoverTypography),
          };
        }
      }

      // Process clicked style
      if (node.clickedTypographyId) {
        const clickedTypography =
          typographyData.items[node.clickedTypographyId];
        if (clickedTypography) {
          interactionStyles.click = {
            textStyle: buildInteractionStyle(clickedTypography),
          };
        }
      }

      element = {
        ...element,
        text: node.text,
        content: node.text,
        textStyle: finalStyle,
        ...interactionStyles,
      };

      if (node.type === "text-ref-character-name") {
        element.type = "text";
        element.content = "${dialogue.character.name}";
      }

      if (node.type === "text-revealing-ref-dialogue-content") {
        element.type = "text";
        element.content = "${dialogue.content[0].text}";
      }

      if (node.type === "text-ref-choice-item-content") {
        element.type = "text";
        element.content = "${item.content}";
      }
    }

    if (node.type === "sprite") {
      if (node.imageId && imageItems) {
        // node.imageId contains an imageId, so we need to look up the image
        const image = imageItems[node.imageId];
        if (image && image.fileId) {
          element.src = `${image.fileId}`;
        }
      }
      if (node.hoverImageId && imageItems) {
        // node.hoverImageId contains an imageId, so we need to look up the image
        const hoverImage = imageItems[node.hoverImageId];
        if (hoverImage && hoverImage.fileId) {
          element.hover = {
            src: `${hoverImage.fileId}`,
          };
        }
      }
      if (node.clickImageId && imageItems) {
        // node.clickImageId contains an imageId, so we need to look up the image
        const clickImage = imageItems[node.clickImageId];
        if (clickImage && clickImage.fileId) {
          element.click = {
            ...element.click,
            src: `${clickImage.fileId}`,
          };
        }
      }
    }

    if (node.type === "slider") {
      element.direction = node.direction ?? "horizontal";
      element.min = node.min ?? 0;
      element.max = node.max ?? 100;
      element.step = node.step ?? 1;
      element.initialValue = node.initialValue ?? 0;

      // Map thumbImageId to thumbSrc
      if (node.thumbImageId && imageItems) {
        const thumbImage = imageItems[node.thumbImageId];
        if (thumbImage && thumbImage.fileId) {
          element.thumbSrc = `${thumbImage.fileId}`;
        }
      }

      // Map barImageId to barSrc
      if (node.barImageId && imageItems) {
        const barImage = imageItems[node.barImageId];
        if (barImage && barImage.fileId) {
          element.barSrc = `${barImage.fileId}`;
        }
      }

      // Handle hover state
      if (node.hoverThumbImageId || node.hoverBarImageId) {
        element.hover = element.hover || {};

        if (node.hoverThumbImageId && imageItems) {
          const hoverThumbImage = imageItems[node.hoverThumbImageId];
          if (hoverThumbImage && hoverThumbImage.fileId) {
            element.hover.thumbSrc = `${hoverThumbImage.fileId}`;
          }
        }

        if (node.hoverBarImageId && imageItems) {
          const hoverBarImage = imageItems[node.hoverBarImageId];
          if (hoverBarImage && hoverBarImage.fileId) {
            element.hover.barSrc = `${hoverBarImage.fileId}`;
          }
        }
      }

      // Handle change event if defined
      if (node.change) {
        element.change = normalizeSliderChange(node.change, node.id);
      }
    }

    if (
      node.type === "container" ||
      node.type === "container-ref-choice-item"
    ) {
      // For containers, we need to handle direction and children
      element.direction = node.direction;
      element.gap = node.gap;
      element.containerType = node.containerType;

      if (node.type === "container-ref-choice-item") {
        element.type = "container";
        element.$each = "item, i in choice.items";
        element.id = `${node.id}-\${i}`;
        element.click = {
          actionPayload: {
            actions: "${item.events.click.actions}",
          },
        };
      }
    }

    if (node.children && node.children.length > 0) {
      element.children = node.children.map(mapNode);

      if (node.type === "container-ref-choice-item") {
        element.children = updateChildrenIds(element.children, "i");
      }
    }

    return element;
  };

  return layout.map(mapNode);
};

/**
 * Gets variable options from variablesData for use in dropdowns.
 *
 * @param {Object} variablesData - Variables data from repository { items: {}, tree: [] }
 * @param {Object} options - Filter options
 * @param {string} options.type - Filter by variable type ('number', 'boolean', 'string', 'object')
 * @param {boolean} options.showType - Show type in label (e.g., "volume (number)")
 * @returns {Array} Array of { label, value } options
 *
 * @example
 * // Get all variables
 * getVariableOptions(variablesData)
 *
 * // Get only number variables
 * getVariableOptions(variablesData, { type: 'number' })
 *
 * // Get all variables with type shown
 * getVariableOptions(variablesData, { showType: true })
 */
export const getVariableOptions = (variablesData, options = {}) => {
  const { type, showType = false } = options;
  const variablesItems = variablesData?.items || {};

  return Object.entries(variablesItems)
    .filter(([_, item]) => {
      // Filter out folders
      if (item.type === "folder" || item.itemType === "folder") {
        return false;
      }
      // Filter by type if specified
      if (type && item.type !== type) {
        return false;
      }
      return true;
    })
    .map(([id, variable]) => {
      const varType = (variable.type || "string").toLowerCase();
      return {
        label: showType ? `${variable.name} (${varType})` : variable.name,
        value: id,
      };
    });
};
