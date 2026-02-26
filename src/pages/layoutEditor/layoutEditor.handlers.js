import { filter, fromEvent, tap, debounceTime } from "rxjs";
import { toHierarchyStructure } from "#domain-structure";
import {
  extractFileIdsFromRenderState,
  layoutHierarchyStructureToRenderState,
} from "../../utils/index.js";
import { parseAndRender } from "jempl";

const mountLegacySubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const DEBOUNCE_DELAYS = {
  UPDATE: 500, // Regular updates (forms, etc)
  KEYBOARD: 1000, // Keyboard final save
};

const KEYBOARD_UNITS = {
  NORMAL: 1,
  FAST: 10, // With shift key
};

const toAlphanumericId = (value, fallback = "sliderUpdate") => {
  const sanitized = String(value || "").replace(/[^a-zA-Z0-9]/g, "");
  return sanitized || fallback;
};

const isBlobUrl = (url) => typeof url === "string" && url.startsWith("blob:");

// File content cache to avoid redundant API calls
const fileContentCache = new Map();

// Track keyboard navigation timeout
let keyboardNavigationTimeout = null;

export const handleBeforeMount = (deps) => {
  return mountLegacySubscriptions(deps);
};

/**
 * Schedule a final save after keyboard navigation stops
 * @param {Object} deps - Component dependencies
 * @param {string} itemId - The item ID being edited
 * @param {string} layoutId - The layout ID
 */
const scheduleKeyboardSave = (deps, itemId, layoutId) => {
  // Clear existing timeout if still navigating
  if (keyboardNavigationTimeout) {
    clearTimeout(keyboardNavigationTimeout);
  }

  keyboardNavigationTimeout = setTimeout(() => {
    const { store, subject } = deps;

    // Check if the selected item has changed
    if (store.selectSelectedItemId() !== itemId) {
      keyboardNavigationTimeout = null;
      return;
    }

    // Final render to ensure bounds are properly updated
    renderLayoutPreview(deps, { skipAssetLoading: true });

    // Save final position to repository
    const finalItem = store.selectSelectedItem();
    if (finalItem) {
      subject.dispatch("layoutEditor.updateElement", {
        layoutId,
        selectedItemId: itemId,
        updatedItem: finalItem,
        replace: true,
      });
    }

    keyboardNavigationTimeout = null;
  }, DEBOUNCE_DELAYS.KEYBOARD);
};

/**
 * Load assets (images and fonts) for rendering
 * @param {Object} deps - Component dependencies
 * @param {Array} fileReferences - File references with url and type to load
 * @param {Object} fontsItems - Font items from repository
 * @returns {Promise<Object>} Loaded assets
 */
const loadAssets = async (deps, fileReferences, fontsItems) => {
  const { projectService } = deps;
  const assets = {};

  for (const fileObj of fileReferences) {
    const { url: fileId, type: fileType } = fileObj;

    // Check cache first
    let url;
    const cacheKey = fileId;

    if (fileContentCache.has(cacheKey)) {
      const cachedUrl = fileContentCache.get(cacheKey);
      if (!isBlobUrl(cachedUrl)) {
        url = cachedUrl;
      } else {
        // Blob URLs are short-lived and can be revoked by consumers.
        fileContentCache.delete(cacheKey);
      }
    }

    if (!url) {
      // Fetch from API if not in cache
      const result = await projectService.getFileContent(fileId);
      url = result.url;
      // Cache only stable URLs. Blob URLs can become invalid after revoke.
      if (!isBlobUrl(url)) {
        fileContentCache.set(cacheKey, url);
      }
    }

    // Use type from fileObj, default to image/png
    let type = fileType || "image/png";

    // Check if this is a font file by looking in fonts data
    const fontItem = Object.values(fontsItems).find(
      (font) => font.fileId === fileId,
    );

    if (fontItem) {
      // This is a font file, determine MIME type
      const fileName = fontItem.name || "";
      if (fileName.endsWith(".woff2")) type = "font/woff2";
      else if (fileName.endsWith(".woff")) type = "font/woff";
      else if (fileName.endsWith(".ttf")) type = "font/ttf";
      else if (fileName.endsWith(".otf")) type = "font/otf";
      else type = "font/ttf"; // default font type

      // For fonts, use fontFamily as the key instead of fileId
      assets[fontItem.fontFamily] = {
        url: url,
        type: type,
      };
    } else {
      // For non-fonts (like images), use the file reference
      assets[`${fileId}`] = {
        url: url,
        type: type,
      };
    }
  }

  return assets;
};

/**
 * Get render state from repository and store data
 * @param {Object} deps - Component dependencies
 * @returns {Object} Render state data
 */
const getRenderState = async (deps) => {
  const { store, projectService } = deps;
  const repository = await projectService.getRepository();
  const {
    layouts,
    images: { items: imageItems },
    typography: typographyData,
    colors: colorsData,
    fonts: fontsData,
  } = repository.getState();
  const typographyItems = typographyData?.items || {};
  const colorsItems = colorsData?.items || {};
  const fontsItems = fontsData?.items || {};

  const layoutId = store.selectLayoutId();
  const storeElements = store.selectItems();
  const layoutElements = storeElements || layouts.items[layoutId]?.elements;
  const layoutHierarchyStructure = toHierarchyStructure(layoutElements);
  const renderStateElements = layoutHierarchyStructureToRenderState(
    layoutHierarchyStructure,
    imageItems,
    { items: typographyItems },
    { items: colorsItems },
    { items: fontsItems },
  );
  return {
    renderStateElements,
    layoutHierarchyStructure,
    fontsItems,
    imageItems,
    typographyItems,
    colorsItems,
  };
};

// Calculate absolute position by traversing the hierarchy
const calculateAbsolutePosition = (
  elements,
  targetId,
  parentX = 0,
  parentY = 0,
) => {
  for (const element of elements) {
    if (element.id === targetId || element.id === `${targetId}-0`) {
      // Simple absolute position: parent position + element relative position
      const x = parentX + element.x;
      const y = parentY + element.y;

      return {
        x,
        y,
        width: element.width,
        height: element.height,
        originX: element.originX,
        originY: element.originY,
      };
    }

    if (element.children && element.children.length > 0) {
      // Container's absolute position for its children
      const x = parentX + element.x;
      const y = parentY + element.y;

      const found = calculateAbsolutePosition(element.children, targetId, x, y);
      if (found) return found;
    }
  }
  return null;
};

const renderLayoutPreview = async (deps) => {
  try {
    const { store, graphicsService, projectService } = deps;

    const { renderStateElements, fontsItems } = await getRenderState(deps);

    const choicesData = store.selectChoicesData();

    const selectedItem = store.selectSelectedItem();

    const fileReferences = extractFileIdsFromRenderState(renderStateElements);
    let assets = await loadAssets(deps, fileReferences, fontsItems);
    try {
      await graphicsService.loadAssets(assets);
    } catch {
      // Recover from stale URL cache (especially revoked blob URLs).
      fileContentCache.clear();
      assets = await loadAssets(deps, fileReferences, fontsItems);
      await graphicsService.loadAssets(assets);
    }

    let elementsToRender = renderStateElements;

    // Get variables from repository and extract default values
    const repository = await projectService.getRepository();
    const { variables: variablesData } = repository.getState();
    const variableItems = variablesData?.items || {};
    const variables = {};
    const TYPE_DEFAULTS = { number: 0, boolean: false, string: "", object: {} };
    Object.entries(variableItems).forEach(([id, config]) => {
      if (config.type !== "folder") {
        variables[id] =
          config.default !== undefined
            ? config.default
            : TYPE_DEFAULTS[config.type];
      }
    });

    const dialogueDefaultValues = store.selectDialogueDefaultValues();
    const characterName = dialogueDefaultValues["dialogue-character-name"];
    const dialogueContent = dialogueDefaultValues["dialogue-content"];
    const data = {
      variables,
      dialogue: {
        content: [{ text: dialogueContent }],
        character: { name: characterName },
        lines: [
          {
            content: [{ text: dialogueContent }],
            characterName,
          },
          {
            content: [{ text: "Narration line sample for NVL layouts." }],
            characterName: "",
          },
        ],
      },
      choice: choicesData,
    };

    const finalElements = parseAndRender(elementsToRender, data);

    const parsedState = graphicsService.parse({
      elements: finalElements,
    });

    if (!selectedItem) {
      graphicsService.render({
        elements: finalElements,
        animations: [],
      });
      return;
    }

    const result = calculateAbsolutePosition(
      parsedState.elements,
      selectedItem.id,
    );

    if (result) {
      const redDot = {
        id: "selected-anchor",
        type: "rect",
        x: result.x + result.originX - 6,
        y: result.y + result.originY - 6,
        radius: 6,
        width: 12,
        height: 12,
        fill: "white",
      };

      const border = {
        id: "selected-border",
        type: "rect",
        x: result.x,
        y: result.y,
        fill: "transparent",
        width: result.width ?? 0,
        height: result.height ?? 0,
        border: {
          color: "white",
          width: 2,
          alpha: 1,
        },
        hover: {
          cursor: "all-scroll",
        },
        drag: {
          move: {},
          start: {},
          end: {},
        },
      };
      graphicsService.render({
        elements: [...finalElements, border, redDot],
        animations: [],
      });
    }
  } catch (error) {
    console.error("[layoutEditor] Failed to render preview", error);
  }
};

export const handleAfterMount = async (deps) => {
  const { appService, store, projectService, render, refs, graphicsService } =
    deps;
  const payload = appService.getPayload() || {};
  const { layoutId } = payload;
  const repository = await projectService.getRepository();
  const { layouts, images, typography, colors, fonts, variables } =
    repository.getState();
  const layout = layoutId ? layouts.items?.[layoutId] : null;
  store.setLayout({ id: layoutId, layout });
  store.setItems({ layoutData: layout?.elements || { items: {}, tree: [] } });
  store.setImages({ images: images });
  store.setTypographyData({
    typographyData: typography || { items: {}, tree: [] },
  });
  store.setColorsData({ colorsData: colors || { items: {}, tree: [] } });
  store.setFontsData({ fontsData: fonts || { items: {}, tree: [] } });
  store.setVariablesData({
    variablesData: variables || { items: {}, tree: [] },
  });

  const { canvas } = refs;
  await graphicsService.init({ canvas: canvas });

  await renderLayoutPreview(deps);
  render();
};

export const handleBackClick = (deps) => {
  const { appService } = deps;

  const { p } = appService.getPayload();
  appService.navigate("/project/resources/layouts", { p });
};

// Simple render handler for events that only need to trigger a re-render
export const handleRenderOnly = (deps) => deps.render();

export const handleFileExplorerItemClick = async (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail || {};
  const itemId = detail.id || detail.itemId || detail.item?.id;
  if (!itemId) {
    return;
  }
  store.setSelectedItemId({ itemId: itemId });
  render();
  await renderLayoutPreview(deps);
};

// Use the generic render handler
export const handleTargetChanged = handleRenderOnly;
export const handleAddLayoutClick = handleRenderOnly;

export const handleDataChanged = async (deps) => {
  const { appService, store, projectService, render } = deps;
  const { layoutId } = appService.getPayload();
  const repository = await projectService.getRepository();
  const { layouts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setItems({ layoutData: layout?.elements || { items: {}, tree: [] } });
  render();
  await renderLayoutPreview(deps);
};

const unflattenKey = (key, value) => {
  // Support both "." and "_" as separators
  const separator = key.includes(".") ? "." : "_";
  const parts = key.split(separator);
  if (parts.length === 1) {
    return { [key]: value };
  }

  const result = {};
  let current = result;

  for (let i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = {};
    current = current[parts[i]];
  }

  current[parts[parts.length - 1]] = value;
  return result;
};

const deepMerge = (target, source) => {
  const result = { ...target };

  Object.keys(source).forEach((key) => {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      // If source is empty object, replace instead of merge
      if (Object.keys(source[key]).length === 0) {
        result[key] = source[key];
      } else if (result[key] && typeof result[key] === "object") {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    } else {
      result[key] = source[key];
    }
  });

  return result;
};

export const handleDialogueFormChange = async (deps, payload) => {
  const { store, render } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setDialogueDefaultValue({ name, fieldValue });
  render();

  await renderLayoutPreview(deps);
};

export const handleChoiceFormChange = async (deps, payload) => {
  const { store, render } = deps;
  const { name, value: fieldValue } = payload._event.detail;

  store.setChoiceDefaultValue({ name, fieldValue });
  render();

  await renderLayoutPreview(deps);
};

export const handleArrowKeyDown = async (deps, payload) => {
  const { store, render } = deps;
  const { _event: e } = payload;

  const currentItem = store.selectSelectedItem();
  if (!currentItem) {
    return;
  }

  const unit = e.shiftKey ? KEYBOARD_UNITS.FAST : KEYBOARD_UNITS.NORMAL;
  let change = {};
  const layoutId = store.selectLayoutId();

  if (payload._event.key === "ArrowUp") {
    if (e.metaKey) {
      change = {
        height: Math.round(currentItem.height - unit),
      };
    } else {
      change = {
        y: Math.round(currentItem.y - unit),
      };
    }
  } else if (payload._event.key === "ArrowDown") {
    if (e.metaKey) {
      change = {
        height: Math.round(currentItem.height + unit),
      };
    } else {
      change = {
        y: Math.round(currentItem.y + unit),
      };
    }
  } else if (payload._event.key === "ArrowLeft") {
    if (e.metaKey) {
      change = {
        width: Math.round(currentItem.width - unit),
      };
    } else {
      change = {
        x: Math.round(currentItem.x - unit),
      };
    }
  } else if (payload._event.key === "ArrowRight") {
    if (e.metaKey) {
      change = {
        width: Math.round(currentItem.width + unit),
      };
    } else {
      change = {
        x: Math.round(currentItem.x + unit),
      };
    }
  }

  const updatedItem = { ...currentItem, ...change };
  store.updateSelectedItem({ updatedItem: updatedItem });
  render();
  await renderLayoutPreview(deps);
  scheduleKeyboardSave(deps, currentItem.id, layoutId);
};

/**
 * Handler for debounced element updates (saves to repository)
 * @param {Object} payload - Update payload
 * @param {Object} deps - Component dependencies
 * @param {boolean} skipUIUpdate - Skip UI updates for drag operations
 */
async function handleDebouncedUpdate(deps, payload) {
  const { projectService, store } = deps;
  const { layoutId, selectedItemId, updatedItem, replace } = payload;

  // Save to repository
  await projectService.updateLayoutElement({
    layoutId,
    elementId: selectedItemId,
    patch: updatedItem,
    replace: replace === true,
  });

  // For form/keyboard updates, sync store with repository
  const { layouts, images } = projectService.getState();
  const layout = layouts.items[layoutId];

  store.setItems({ layoutData: layout?.elements || { items: {}, tree: [] } });
  store.setImages({ images: images });
}

const subscriptions = (deps) => {
  const { subject, appService } = deps;
  const { isInputFocused } = appService;
  return [
    fromEvent(window, "keydown").pipe(
      filter((e) => {
        const isInput = isInputFocused();
        if (isInput) {
          return;
        }
        return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.key,
        );
      }),
      tap((e) => {
        handleArrowKeyDown(deps, { _event: e });
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-start"),
      tap(() => {
        handlePointerUp(deps);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-end"),
      tap(() => {
        handlePointerDown(deps);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "border-drag-move"),
      tap(({ payload }) => {
        handleCanvasMouseMove(deps, payload);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "layoutEditor.updateElement"),
      debounceTime(DEBOUNCE_DELAYS.UPDATE),
      tap(async ({ payload }) => {
        await handleDebouncedUpdate(deps, payload);
      }),
    ),
  ];
};

export const handleLayoutEditPanelUpdateHandler = async (deps, payload) => {
  const { store, render } = deps;
  const layoutId = store.selectLayoutId();
  const selectedItemId = store.selectSelectedItemId();
  const detail = payload._event.detail;

  let updatedItem;

  if (
    detail.name === "anchor" &&
    detail.value &&
    typeof detail.value === "object"
  ) {
    const currentItem = store.selectSelectedItem();
    updatedItem = deepMerge(currentItem, {
      anchorX: detail.value.x,
      anchorY: detail.value.y,
    });
  } else if (detail.name.includes(".")) {
    // For nested paths, directly set the value instead of merging
    const currentItem = store.selectSelectedItem();
    updatedItem = structuredClone(currentItem);
    const parts = detail.name.split(".");
    let current = updatedItem;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = detail.value;
  } else {
    const currentItem = store.selectSelectedItem();
    const unflattenedUpdate = unflattenKey(detail.name, detail.value);
    updatedItem = deepMerge(currentItem, unflattenedUpdate);
    updatedItem[detail.name] = detail.value;

    // Auto-switch slider settings when direction changes (remembers per-direction)
    if (detail.name === "direction" && currentItem.type === "slider") {
      const oldDirection = currentItem.direction || "horizontal";
      const newDirection = detail.value;

      // Save current settings to old direction
      const savedKey = `_saved${oldDirection.charAt(0).toUpperCase() + oldDirection.slice(1)}`;
      updatedItem[savedKey] = {
        barImageId: currentItem.barImageId,
        hoverBarImageId: currentItem.hoverBarImageId,
        thumbImageId: currentItem.thumbImageId,
        hoverThumbImageId: currentItem.hoverThumbImageId,
        width: currentItem.width,
        height: currentItem.height,
      };

      // Check for saved settings for new direction
      const restoreKey = `_saved${newDirection.charAt(0).toUpperCase() + newDirection.slice(1)}`;
      const saved = currentItem[restoreKey];

      if (saved) {
        // Restore saved settings
        updatedItem.barImageId = saved.barImageId;
        updatedItem.hoverBarImageId = saved.hoverBarImageId;
        updatedItem.thumbImageId = saved.thumbImageId;
        updatedItem.hoverThumbImageId = saved.hoverThumbImageId;
        updatedItem.width = saved.width;
        updatedItem.height = saved.height;
      } else {
        // First time - use defaults and swap dimensions
        if (newDirection === "vertical") {
          updatedItem.barImageId = "slider_bar_vertical";
          updatedItem.hoverBarImageId = "slider_bar_vertical_hover";
        } else {
          updatedItem.barImageId = "slider_bar_default";
          updatedItem.hoverBarImageId = "slider_bar_hover";
        }
        // Reset thumb to defaults (same for both directions)
        updatedItem.thumbImageId = "slider_thumb_default";
        updatedItem.hoverThumbImageId = "slider_thumb_hover";

        updatedItem.width = currentItem.height;
        updatedItem.height = currentItem.width;
      }
    }

    // Handle slider variable binding
    if (detail.name === "variableId" && currentItem.type === "slider") {
      const variableId = detail.value;

      if (variableId) {
        const updateVariableId = toAlphanumericId(
          `slider${currentItem.id}update`,
        );
        // Set up change.actionPayload for variable binding
        updatedItem.change = {
          actionPayload: {
            actions: {
              updateVariable: {
                id: updateVariableId,
                operations: [
                  {
                    variableId: variableId,
                    op: "set",
                    value: "_event.value",
                  },
                ],
              },
            },
          },
        };
        // Bind initialValue to the variable
        updatedItem.initialValue = `\${variables.${variableId}}`;
      } else {
        // Remove change binding when no variable selected
        delete updatedItem.change;
        // Reset initialValue to a static value
        updatedItem.initialValue = updatedItem.min || 0;
      }
    }
  }
  if (
    updatedItem.type === "sprite" &&
    (updatedItem.width === 0 || updatedItem.height === 0)
  ) {
    const preloadedImages = store.selectImages();
    updatedItem.width = preloadedImages.items[updatedItem.imageId].width;
    updatedItem.height = preloadedImages.items[updatedItem.imageId].height;
  }

  store.updateSelectedItem({ updatedItem: updatedItem });
  render();

  const { subject } = deps;
  subject.dispatch("layoutEditor.updateElement", {
    layoutId,
    selectedItemId,
    updatedItem,
    replace: true,
  });
  await renderLayoutPreview(deps, { skipAssetLoading: false });
};

export const handleCanvasMouseMove = (deps, payload) => {
  const { store, subject } = deps;
  if (
    !payload ||
    typeof payload.x !== "number" ||
    typeof payload.y !== "number"
  ) {
    return;
  }
  const { x, y } = payload;

  const drag = store.selectDragging();

  const item = store.selectSelectedItem();
  if (!item) {
    return;
  }
  if (!drag.dragStartPosition) {
    store.setDragStartPosition({
      x,
      y,
      itemStartX: item.x,
      itemStartY: item.y,
    });
    return;
  }

  const updatedItem = {
    ...item,
    x: drag.dragStartPosition.itemStartX + x - drag.dragStartPosition.x,
    y: drag.dragStartPosition.itemStartY + y - drag.dragStartPosition.y,
  };

  store.updateSelectedItem({ updatedItem: updatedItem });
  renderLayoutPreview(deps);

  subject.dispatch("layoutEditor.updateElement", {
    layoutId: store.selectLayoutId(),
    selectedItemId: item.id,
    updatedItem,
    replace: true,
  });
};

export const handlePointerUp = (deps) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItem();
  if (!currentItem) {
    return;
  }
  store.startDragging({});
  render();
};

export const handlePointerDown = (deps) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItem();
  if (!currentItem) {
    return;
  }
  store.stopDragging({ isDragging: false });
  render();
};
