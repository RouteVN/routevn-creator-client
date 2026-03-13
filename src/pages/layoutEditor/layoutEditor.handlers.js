import { filter, fromEvent, tap, debounceTime } from "rxjs";
import {
  createCollabRemoteRefreshStream,
  matchesRemoteTargets,
} from "../../internal/ui/collabRefresh.js";
import {
  createLayoutPreviewData,
  createSelectedLayoutOverlay,
  resolveLayoutPreviewElements,
} from "./layoutPreview.js";
import { buildLayoutRenderElements } from "../../internal/project/layout.js";
import { toHierarchyStructure } from "../../internal/project/tree.js";
import { extractFileIdsFromRenderState } from "../../internal/project/layout.js";
import { createLayoutElementsFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";

const mountSubscriptions = (deps) => {
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

const isPlainObject = (value) => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const areValuesEqual = (left, right) => {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => areValuesEqual(value, right[index]))
    );
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.hasOwn(right, key) && areValuesEqual(left[key], right[key]),
      )
    );
  }

  return false;
};

const createObjectPatch = (previousValue, nextValue) => {
  const previousObject = isPlainObject(previousValue) ? previousValue : {};
  const nextObject = isPlainObject(nextValue) ? nextValue : {};
  const patch = {};
  let hasChanges = false;
  let requiresReplace = false;

  for (const key of Object.keys(previousObject)) {
    if (!Object.hasOwn(nextObject, key)) {
      requiresReplace = true;
      break;
    }
  }

  for (const [key, value] of Object.entries(nextObject)) {
    if (!Object.hasOwn(previousObject, key)) {
      patch[key] = structuredClone(value);
      hasChanges = true;
      continue;
    }

    const previousEntry = previousObject[key];

    if (areValuesEqual(previousEntry, value)) {
      continue;
    }

    if (isPlainObject(previousEntry) && isPlainObject(value)) {
      const nestedResult = createObjectPatch(previousEntry, value);
      if (nestedResult.requiresReplace) {
        requiresReplace = true;
      } else if (nestedResult.hasChanges) {
        patch[key] = nestedResult.patch;
        hasChanges = true;
      }
      continue;
    }

    patch[key] = structuredClone(value);
    hasChanges = true;
  }

  return {
    patch,
    hasChanges,
    requiresReplace,
  };
};

export const handleBeforeMount = (deps) => {
  const cleanupSubscriptions = mountSubscriptions(deps);
  return () => {
    const keyboardNavigationTimeoutId =
      deps.store.selectKeyboardNavigationTimeoutId();
    if (keyboardNavigationTimeoutId !== undefined) {
      clearTimeout(keyboardNavigationTimeoutId);
      deps.store.clearKeyboardNavigationTimeout();
    }
    cleanupSubscriptions?.();
  };
};

/**
 * Schedule a final save after keyboard navigation stops
 * @param {Object} deps - Component dependencies
 * @param {string} itemId - The item ID being edited
 * @param {string} layoutId - The layout ID
 */
const scheduleKeyboardSave = (deps, itemId, layoutId) => {
  const { store } = deps;
  const keyboardNavigationTimeoutId = store.selectKeyboardNavigationTimeoutId();
  // Clear existing timeout if still navigating
  if (keyboardNavigationTimeoutId !== undefined) {
    clearTimeout(keyboardNavigationTimeoutId);
  }

  const timeoutId = setTimeout(() => {
    const { subject } = deps;

    // Check if the selected item has changed
    if (store.selectSelectedItemId() !== itemId) {
      store.clearKeyboardNavigationTimeout();
      return;
    }

    // Final render to ensure bounds are properly updated
    renderLayoutPreview(deps, { skipAssetLoading: true });

    // Save final position to repository
    const finalItem = store.selectSelectedItemData();
    if (finalItem) {
      subject.dispatch("layoutEditor.updateElement", {
        layoutId,
        selectedItemId: itemId,
        updatedItem: finalItem,
      });
    }

    store.clearKeyboardNavigationTimeout();
  }, DEBOUNCE_DELAYS.KEYBOARD);

  store.setKeyboardNavigationTimeoutId({ timeoutId });
};

/**
 * Load assets (images and fonts) for rendering
 * @param {Object} deps - Component dependencies
 * @param {Array} fileReferences - File references with url and type to load
 * @param {Object} fontsItems - Font items from repository
 * @returns {Promise<Object>} Loaded assets
 */
const loadAssets = async (deps, fileReferences, fontsItems) => {
  const { projectService, store } = deps;
  const assets = {};

  for (const fileObj of fileReferences) {
    const { url: fileId, type: fileType } = fileObj;

    // Check cache first
    let url;
    const cacheKey = fileId;

    const cachedUrl = store.selectCachedFileContent({ fileId: cacheKey });

    if (cachedUrl) {
      if (!isBlobUrl(cachedUrl)) {
        url = cachedUrl;
      } else {
        // Blob URLs are short-lived and can be revoked by consumers.
        store.clearCachedFileContent({ fileId: cacheKey });
      }
    }

    if (!url) {
      // Fetch from API if not in cache
      const result = await projectService.getFileContent(fileId);
      url = result.url;
      // Cache only stable URLs. Blob URLs can become invalid after revoke.
      if (!isBlobUrl(url)) {
        store.cacheFileContent({ fileId: cacheKey, url });
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

      assets[`${fileId}`] = {
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
    variables: variablesData,
  } = repository.getState();
  const typographyItems = typographyData?.items || {};
  const colorsItems = colorsData?.items || {};
  const fontsItems = fontsData?.items || {};

  const layoutId = store.selectLayoutId();
  const storeElements = store.selectItems();
  const layoutElements = storeElements || layouts.items[layoutId]?.elements;
  const layoutHierarchyStructure = toHierarchyStructure(layoutElements);
  const renderStateElements = buildLayoutRenderElements(
    layoutHierarchyStructure,
    imageItems,
    { items: typographyItems },
    { items: colorsItems },
    { items: fontsItems },
    { layoutId },
  );
  return {
    renderStateElements,
    layoutHierarchyStructure,
    fontsItems,
    imageItems,
    typographyItems,
    colorsItems,
    variablesData,
  };
};

const renderLayoutPreview = async (deps) => {
  try {
    const { store, graphicsService } = deps;

    const { renderStateElements, fontsItems, variablesData } =
      await getRenderState(deps);

    const choicesData = store.selectChoicesData();

    const selectedItem = store.selectSelectedItemData();

    const fileReferences = extractFileIdsFromRenderState(renderStateElements);
    let assets = await loadAssets(deps, fileReferences, fontsItems);
    try {
      await graphicsService.loadAssets(assets);
    } catch {
      // Recover from stale URL cache (especially revoked blob URLs).
      deps.store.clearFileContentCache();
      assets = await loadAssets(deps, fileReferences, fontsItems);
      await graphicsService.loadAssets(assets);
    }

    const finalElements = resolveLayoutPreviewElements({
      elements: renderStateElements,
      previewData: createLayoutPreviewData({
        variablesData,
        dialogueDefaultValues: store.selectDialogueDefaultValues(),
        choicesData,
      }),
    });

    const parsedState = graphicsService.parse({
      elements: finalElements,
    });
    const overlayElements = createSelectedLayoutOverlay({
      parsedElements: parsedState.elements,
      selectedItemId: selectedItem?.id,
    });

    graphicsService.render({
      elements: [...finalElements, ...overlayElements],
      animations: [],
    });
  } catch (error) {
    console.error("[layoutEditor] Failed to render preview", error);
  }
};

const syncLayoutEditorState = (deps, repositoryState, layoutId) => {
  const { store } = deps;
  const { layouts, images, typography, colors, fonts, variables } =
    repositoryState;
  const layout = layoutId ? layouts.items?.[layoutId] : undefined;

  store.setLayout({ id: layoutId, layout });
  store.setItems({ layoutData: layout?.elements || { items: {}, tree: [] } });
  store.setImages({ images: images || { items: {}, tree: [] } });
  store.setTypographyData({
    typographyData: typography || { items: {}, tree: [] },
  });
  store.setColorsData({ colorsData: colors || { items: {}, tree: [] } });
  store.setFontsData({ fontsData: fonts || { items: {}, tree: [] } });
  store.setVariablesData({
    variablesData: variables || { items: {}, tree: [] },
  });
};

export const handleAfterMount = async (deps) => {
  const { appService, projectService, render, refs, graphicsService } = deps;
  const payload = appService.getPayload() || {};
  const { layoutId } = payload;
  const repository = await projectService.getRepository();
  syncLayoutEditorState(deps, repository.getState(), layoutId);

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

export const handleAddLayoutClick = handleRenderOnly;

const refreshLayoutEditorData = async (deps) => {
  const { appService, projectService, render } = deps;
  const { layoutId } = appService.getPayload();
  const repository = await projectService.getRepository();
  syncLayoutEditorState(deps, repository.getState(), layoutId);
  render();
  await renderLayoutPreview(deps);
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createLayoutElementsFileExplorerHandlers({
    getLayoutId: (deps) => deps.store.selectLayoutId(),
    refresh: refreshLayoutEditorData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshLayoutEditorData;

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

  const currentItem = store.selectSelectedItemData();
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
  const { appService, projectService } = deps;
  const { layoutId, selectedItemId, updatedItem, replace } = payload;
  const currentItem =
    projectService.getState()?.layouts?.items?.[layoutId]?.elements?.items?.[
      selectedItemId
    ];

  if (!currentItem || !updatedItem) {
    return;
  }

  const previousItem = {
    id: selectedItemId,
    ...currentItem,
  };
  const diff = createObjectPatch(previousItem, updatedItem);

  if (!diff.hasChanges && !diff.requiresReplace) {
    return;
  }

  const shouldReplace = replace === true || diff.requiresReplace;

  // Save to repository
  await projectService.updateLayoutElement({
    layoutId,
    elementId: selectedItemId,
    patch: shouldReplace ? updatedItem : diff.patch,
    replace: shouldReplace,
  });

  // For form/keyboard updates, sync store with repository
  syncLayoutEditorState(
    deps,
    projectService.getState(),
    appService.getPayload().layoutId || layoutId,
  );
}

const subscriptions = (deps) => {
  const { subject, appService } = deps;
  const { isInputFocused } = appService;
  return [
    createCollabRemoteRefreshStream({
      deps,
      matches: matchesRemoteTargets([
        "layouts",
        "images",
        "typography",
        "colors",
        "fonts",
        "variables",
      ]),
      refresh: refreshLayoutEditorData,
    }),
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
    const currentItem = store.selectSelectedItemData();
    updatedItem = deepMerge(currentItem, {
      anchorX: detail.value.x,
      anchorY: detail.value.y,
    });
  } else if (detail.name.includes(".")) {
    // For nested paths, directly set the value instead of merging
    updatedItem = structuredClone(store.selectSelectedItemData());
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
    const currentItem = store.selectSelectedItemData();
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
        // Reset initialValue to a static numeric value
        const parsedMin = Number(updatedItem.min);
        updatedItem.initialValue = Number.isFinite(parsedMin) ? parsedMin : 0;
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

  const item = store.selectSelectedItemData();
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
  });
};

export const handlePointerUp = (deps) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  store.startDragging({});
  render();
};

export const handlePointerDown = (deps) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItemData();
  if (!currentItem) {
    return;
  }
  store.stopDragging({ isDragging: false });
  render();
};
