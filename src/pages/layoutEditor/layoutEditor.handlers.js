import { filter, fromEvent, tap, debounceTime } from "rxjs";
import { toTreeStructure } from "../../deps/repository";
import {
  extractFileIdsFromRenderState,
  layoutTreeStructureToRenderState,
} from "../../utils/index.js";
import { parseAndRender } from "jempl";

const DEBOUNCE_DELAYS = {
  UPDATE: 500, // Regular updates (forms, etc)
  KEYBOARD: 1000, // Keyboard final save
};

const KEYBOARD_UNITS = {
  NORMAL: 1,
  FAST: 10, // With shift key
};

// File content cache to avoid redundant API calls
const fileContentCache = new Map();

// Track keyboard navigation timeout
let keyboardNavigationTimeout = null;

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
  const { fileManagerFactory, router } = deps;
  const { p } = router.getPayload();
  const assets = {};

  // Get fileManager for this project
  const fileManager = await fileManagerFactory.getByProject(p);

  for (const fileObj of fileReferences) {
    const { url: fileId, type: fileType } = fileObj;

    // Check cache first
    let url;
    const cacheKey = `${fileId}_${p}`;

    if (fileContentCache.has(cacheKey)) {
      url = fileContentCache.get(cacheKey);
    } else {
      // Fetch from API if not in cache
      const result = await fileManager.getFileContent({
        fileId: fileId,
      });
      url = result.url;
      // Store in cache for future use
      fileContentCache.set(cacheKey, url);
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
      assets[`file:${fileId}`] = {
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
  const { store, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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
  const layoutTreeStructure = toTreeStructure(layoutElements);
  const renderStateElements = layoutTreeStructureToRenderState(
    layoutTreeStructure,
    imageItems,
    { items: typographyItems },
    { items: colorsItems },
    { items: fontsItems },
  );

  return {
    renderStateElements,
    layoutTreeStructure,
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
    if (element.id === targetId) {
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
  const { store, drenderer } = deps;

  const { renderStateElements, fontsItems } = await getRenderState(deps);

  const choicesData = store.selectChoicesData();

  const selectedItem = store.selectSelectedItem();

  const fileReferences = extractFileIdsFromRenderState(renderStateElements);
  const assets = await loadAssets(deps, fileReferences, fontsItems);
  await drenderer.loadAssets(assets);

  let elementsToRender = renderStateElements;

  const dialogueDefaultValues = store.selectDialogueDefaultValues();
  const data = {
    dialogue: {
      content: [{ text: dialogueDefaultValues["dialogue-content"] }],
      character: { name: dialogueDefaultValues["dialogue-character-name"] },
    },
    choice: choicesData,
  };

  const finalElements = parseAndRender(elementsToRender, data);

  const parsed = drenderer.parse(renderStateElements);

  if (!selectedItem) {
    drenderer.render({
      elements: finalElements,
      transitions: [],
    });
    return;
  }

  const result = calculateAbsolutePosition(parsed, selectedItem.id);

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
      pointerMove: `layout-editor-pointer-move-${selectedItem.id}`,
      pointerDown: `layout-editor-pointer-down-${selectedItem.id}`,
      pointerUp: `layout-editor-pointer-up-${selectedItem.id}`,
      cursor: "all-scroll",
    };

    drenderer.render({
      elements: [...finalElements, border, redDot],
      transitions: [],
    });
  }
};

export const handleAfterMount = async (deps) => {
  const { router, store, repositoryFactory, render, getRefIds, drenderer } =
    deps;
  const { layoutId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { layouts, images, typography, colors, fonts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setLayout({ id: layoutId, layout });
  store.setItems(layout?.elements || { items: {}, tree: [] });
  store.setImages(images);
  store.setTypographyData(typography || { items: {}, tree: [] });
  store.setColorsData(colors || { items: {}, tree: [] });
  store.setFontsData(fonts || { items: {}, tree: [] });

  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });

  await renderLayoutPreview(deps);
  render();
};

export const handleBackClick = (deps) => {
  const { subject, router } = deps;

  const currentPayload = router.getPayload();
  subject.dispatch("redirect", {
    path: "/project/resources/layouts",
    payload: currentPayload,
  });
};

// Simple render handler for events that only need to trigger a re-render
export const handleRenderOnly = (deps) => deps.render();

export const handleFileExplorerItemClick = async (deps, payload) => {
  const { store, render } = deps;
  const itemId = payload._event.detail.id;
  store.setSelectedItemId(itemId);
  render();
  await renderLayoutPreview(deps);
};

// Use the generic render handler
export const handleTargetChanged = handleRenderOnly;
export const handleAddLayoutClick = handleRenderOnly;

export const handleDataChanged = async (deps) => {
  const { router, store, repositoryFactory, render } = deps;
  const { layoutId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { layouts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setItems(layout?.elements || { items: {}, tree: [] });
  render();
  await renderLayoutPreview(deps);
};

const unflattenKey = (key, value) => {
  const parts = key.split("_");
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
      if (result[key] && typeof result[key] === "object") {
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
  const { name, fieldValue } = payload._event.detail;

  store.setDialogueDefaultValue({ name, fieldValue });
  render();

  await renderLayoutPreview(deps);
};

export const handleChoiceFormChange = async (deps, payload) => {
  const { store, render } = deps;
  const { name, fieldValue } = payload._event.detail;

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
  store.updateSelectedItem(updatedItem);
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
  const { repositoryFactory, router, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { layoutId, selectedItemId, updatedItem, replace } = payload;

  // Save to repository
  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.elements`,
    value: {
      id: selectedItemId,
      replace: replace,
      item: updatedItem,
    },
  });

  // For form/keyboard updates, sync store with repository
  const { layouts, images } = repository.getState();
  const layout = layouts.items[layoutId];

  store.setItems(layout?.elements || { items: {}, tree: [] });
  store.setImages(images);
}

export const subscriptions = (deps) => {
  const { subject, isInputFocused } = deps;
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
    fromEvent(window, "keydown").pipe(
      filter((e) => {
        const isInput = isInputFocused();
        if (isInput) {
          return;
        }
        return ["Control"].includes(e.key);
      }),
      tap((e) => {
        handleCtrlKeyDown(deps, { _event: e });
      }),
    ),
    fromEvent(window, "keyup").pipe(
      filter((e) => {
        const isInput = isInputFocused();
        if (isInput) {
          return;
        }
        return ["Control"].includes(e.key);
      }),
      tap((e) => {
        handleCtrlKeyUp(deps, { _event: e });
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "2drendererEvent"),
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

  let unflattenedUpdate;

  if (
    detail.name === "anchor" &&
    detail.value &&
    typeof detail.value === "object"
  ) {
    unflattenedUpdate = {
      anchorX: detail.value.x,
      anchorY: detail.value.y,
    };
  } else {
    unflattenedUpdate = unflattenKey(detail.name, detail.value);
  }

  const currentItem = store.selectSelectedItem();
  const updatedItem = deepMerge(currentItem, unflattenedUpdate);
  updatedItem[detail.name] = detail.value;

  store.updateSelectedItem(updatedItem);
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
  const { x, y } = payload;
  const drag = store.selectDragging();

  if (!drag.isDragging) {
    return;
  }

  const item = store.selectSelectedItem();
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

  store.updateSelectedItem(updatedItem);
  renderLayoutPreview(deps);

  subject.dispatch("layoutEditor.updateElement", {
    layoutId: store.selectLayoutId(),
    selectedItemId: item.id,
    updatedItem,
    replace: true,
  });
};

export const handleCtrlKeyDown = (deps) => {
  const { store, render } = deps;
  const currentItem = store.selectSelectedItem();
  if (!currentItem) {
    return;
  }
  store.startDragging(null);
  render();
};

export const handleCtrlKeyUp = (deps) => {
  const { store, render } = deps;

  const currentItem = store.selectSelectedItem();
  if (!currentItem) {
    return;
  }
  store.stopDragging();
  render();
};
