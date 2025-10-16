import { filter, fromEvent, tap, debounceTime } from "rxjs";
import { toTreeStructure } from "../../deps/repository";
import {
  extractFileIdsFromRenderState,
  layoutTreeStructureToRenderState,
} from "../../utils/index.js";
import { parseAndRender } from "jempl";

const DEBOUNCE_DELAYS = {
  UPDATE: 500, // Regular updates (forms, etc)
  DRAG: 1000, // Drag operations
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
 * Cancel any pending keyboard save
 */
const cancelKeyboardSave = () => {
  if (keyboardNavigationTimeout) {
    clearTimeout(keyboardNavigationTimeout);
    keyboardNavigationTimeout = null;
  }
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

  // Extract items from structured data
  const typographyItems = typographyData?.items || {};
  const colorsItems = colorsData?.items || {};
  const fontsItems = fontsData?.items || {};

  // Use store's elements which have optimistic updates, fallback to repository data
  const layoutId = store.selectLayoutId();
  const storeElements = store.selectItems();
  const layoutElements = storeElements || layouts.items[layoutId]?.elements;

  console.log("layoutElements", layoutElements);

  const layoutTreeStructure = toTreeStructure(layoutElements);

  console.log("layoutTreeStructure", layoutTreeStructure);

  const renderStateElements = layoutTreeStructureToRenderState(
    layoutTreeStructure,
    imageItems,
    { items: typographyItems },
    { items: colorsItems },
    { items: fontsItems },
  );

  console.log("renderStateElements", renderStateElements);

  return {
    renderStateElements,
    layoutTreeStructure,
    fontsItems,
    imageItems,
    typographyItems,
    colorsItems,
  };
};

/**
 * Update element properties with optimistic UI updates and debounced saves
 * @param {Object} deps - Component dependencies
 * @param {Object} changes - Properties to update
 * @param {string} source - Update source: 'form', 'keyboard', 'drag'
 */
const updateElementOptimistically = (deps, changes, source = "form") => {
  const { store, subject } = deps;
  const currentItem = store.selectSelectedItem();
  if (!currentItem) return;

  const layoutId = store.selectLayoutId();

  // Update store immediately for UI feedback
  const updatedItem = { ...currentItem, ...changes };
  store.updateSelectedItem(updatedItem);

  // Determine which action to dispatch based on source
  const action =
    source === "drag"
      ? "layoutEditor.updateElementDrag"
      : "layoutEditor.updateElement";

  // Dispatch debounced save
  subject.dispatch(action, {
    layoutId,
    selectedItemId: currentItem.id,
    updatedItem: changes,
    replace: source === "form",
  });
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
      const absoluteX = parentX + element.x;
      const absoluteY = parentY + element.y;

      let startX = absoluteX - (element.width ?? 0) * (element.anchorX ?? 0);
      let startY = absoluteY - (element.height ?? 0) * (element.anchorY ?? 0);

      return {
        x: absoluteX,
        y: absoluteY,
        width: element.width,
        height: element.height,
        startX,
        startY,
      };
    }

    if (element.children && element.children.length > 0) {
      // Container's absolute position for its children
      const containerAbsoluteX = parentX + element.x;
      const containerAbsoluteY = parentY + element.y;

      const found = calculateAbsolutePosition(
        element.children,
        targetId,
        containerAbsoluteX,
        containerAbsoluteY,
      );
      if (found) return found;
    }
  }
  return null;
};

const renderLayoutPreview = async (deps, options = {}) => {
  const { store, drenderer, render } = deps;
  const { skipAssetLoading = false } = options;

  // Get consolidated render state
  const { renderStateElements, fontsItems } = await getRenderState(deps);

  const choicesData = store.selectChoicesData();

  const selectedItem = store.selectSelectedItem();

  // Skip asset loading during drag for better performance
  if (!skipAssetLoading) {
    const fileReferences = extractFileIdsFromRenderState(renderStateElements);
    const assets = await loadAssets(deps, fileReferences, fontsItems);
    await drenderer.loadAssets(assets);
  }

  let elementsToRender = renderStateElements;

  if (selectedItem) {
  }

  const dialogueDefaultValues = store.selectDialogueDefaultValues();
  const data = {
    dialogue: {
      content: [{ text: dialogueDefaultValues["dialogue-content"] }],
      character: { name: dialogueDefaultValues["dialogue-character-name"] },
    },
    choice: choicesData,
    variables: {
      titleItems: [
        {
          label: "Start",
        },
        {
          label: "Load",
        },
        {
          label: "Options",
        },
        {
          label: "Exit",
        },
      ],
    },
  };

  // const filteredElements = filterChoiceContainers(elementsToRender);
  const finalElements = parseAndRender(elementsToRender, data);

  // Render all elements including red dot
  drenderer.render({
    elements: finalElements,
    transitions: [],
  });

  if (!selectedItem) {
    return;
  }
  const result = calculateAbsolutePosition(
    renderStateElements,
    selectedItem.id,
  );

  if (result) {
    const redDot = {
      id: "selected-anchor",
      type: "rect",
      x: result.x - 6,
      y: result.y - 6,
      radius: 6,
      width: 12,
      height: 12,
      fill: "white",
    };

    // Always use calculated position for consistency
    // This ensures immediate updates for all changes (form, keyboard, drag)
    const borderX = result.startX;
    const borderY = result.startY;

    const border = {
      id: "selected-border",
      type: "rect",
      x: borderX,
      y: borderY,
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

    const baseContainer = {
      id: "selected-border",
      type: "rect",
      x: 0,
      y: 0,
      fill: "transparent",
      width: 1920,
      height: 1080,
      pointerMove: `layout-editor-pointer-move-${selectedItem.id}`,
      pointerUp: `layout-editor-pointer-up-${selectedItem.id}`,
    };

    // Wrap red dot in a container to ensure it's on top
    const redDotContainer = {
      id: "red-dot-container",
      type: "container",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      anchorX: 0,
      anchorY: 0,
      children: [baseContainer, border, redDot],
    };

    // Add container as the LAST top-level element

    drenderer.render({
      elements: [...finalElements, redDotContainer],
      transitions: [],
    });
  }
  store.incrementFormKeyCheckpoint();
  render();
};

export const handleAfterMount = async (deps) => {
  const { router, store, repositoryFactory, render, getRefIds, drenderer } =
    deps;
  const { layoutId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { layouts, images, typography, colors, fonts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setLayoutId(layoutId);
  store.setLayoutType(layout.layoutType);
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

// Simple render handler for events that only need to trigger a re-render
export const handleRenderOnly = (deps) => deps.render();

export const handleFileExplorerItemClick = async (deps, payload) => {
  const { store, render, fileManagerFactory, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const itemId = payload._event.detail.id;
  store.setSelectedItemId(itemId);
  render();

  const selectedItem = store.selectSelectedItem();

  // Fetch image resources for sprite items
  if (selectedItem && selectedItem.type === "sprite") {
    const fieldResources = {};

    // Get images from repository
    const { images } = repository.getState();
    const imageItems = images.items;

    // Get fileManager for this project
    const fileManager = await fileManagerFactory.getByProject(p);

    // Fetch URLs for each image field
    const imageFields = ["imageId", "hoverImageId", "clickImageId"];

    for (const fieldName of imageFields) {
      if (selectedItem[fieldName]) {
        try {
          // Get the image object using the imageId
          const image = imageItems[selectedItem[fieldName]];

          if (image && image.fileId) {
            const { url } = await fileManager.getFileContent({
              fileId: image.fileId,
            });
            fieldResources[fieldName] = { src: url };
          }
        } catch (error) {
          console.error(`Failed to fetch image for ${fieldName}:`, error);
        }
      }
    }

    store.setFieldResources(fieldResources);
    render();
  }

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

export const handleFormChange = async (deps, payload) => {
  const { store, render } = deps;
  const layoutId = store.selectLayoutId();
  const selectedItemId = store.selectSelectedItemId();

  let unflattenedUpdate;

  console.log("payload._event.detail", payload._event.detail);

  // Handle anchor selection specially
  if (
    payload._event.detail.name === "anchor" &&
    payload._event.detail.fieldValue &&
    typeof payload._event.detail.fieldValue === "object"
  ) {
    // When anchor is selected, update both anchorX and anchorY
    unflattenedUpdate = {
      anchorX: payload._event.detail.fieldValue.x,
      anchorY: payload._event.detail.fieldValue.y,
    };
  } else {
    unflattenedUpdate = unflattenKey(
      payload._event.detail.name,
      payload._event.detail.fieldValue,
    );
  }

  const currentItem = store.selectSelectedItem();
  const updatedItem = deepMerge(currentItem, unflattenedUpdate);
  updatedItem[payload._event.detail.name] = payload._event.detail.fieldValue;

  // Update store optimistically for immediate UI feedback
  store.updateSelectedItem(updatedItem);
  render();

  // Dispatch debounced update action to repository
  const { subject } = deps;
  subject.dispatch("layoutEditor.updateElement", {
    layoutId,
    selectedItemId,
    updatedItem,
    replace: true,
  });

  // Render preview immediately for user feedback (skip asset loading for speed)
  await renderLayoutPreview(deps, { skipAssetLoading: true });
};

export const handleFormExtraEvent = async (deps, payload) => {
  const { store, render } = deps;
  const { trigger, name, fieldIndex } = payload._event.detail;

  if (
    !["imageId", "hoverImageId", "clickImageId", "typographyId"].includes(name)
  ) {
    return;
  }

  // Handle image field click - check if name includes "imageId" or "ImageId"
  if (
    trigger === "click" &&
    ["imageId", "hoverImageId", "clickImageId"].includes(name)
  ) {
    const selectedItem = store.selectSelectedItem();
    if (selectedItem) {
      // Get current value for the field
      const currentValue = selectedItem[name] || null;

      // Transform images to groups format for the selector
      const imageGroups = store.selectViewData().imageGroups;

      // Find the field index by matching the field name
      const form = store.selectViewData().form;
      let actualFieldIndex = fieldIndex;
      if (actualFieldIndex === undefined && form && form.fields) {
        actualFieldIndex = form.fields.findIndex(
          (field) => field.name === name,
        );
      }

      store.showImageSelectorDialog({
        fieldIndex: actualFieldIndex,
        groups: imageGroups,
        currentValue,
      });
      render();
    }
    return;
  }

  if (trigger === "contextmenu") {
    const selectedItem = store.selectSelectedItem();
    // Only show context menu if there's actually an image set for this field
    if (selectedItem && selectedItem[name]) {
      payload._event.preventDefault();
      store.showDropdownMenuForImageField({
        position: { x: payload._event.detail.x, y: payload._event.detail.y },
        fieldName: name,
      });
      render();
    }
  }
};

export const handleImageSelectorSelection = (deps, payload) => {
  const { store, render } = deps;
  const { imageId } = payload._event.detail;

  store.setTempSelectedImageId({ imageId });
  render();
};

export const handleConfirmImageSelection = async (deps) => {
  const { store, render, repositoryFactory, router, fileManagerFactory } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const state = store.getState ? store.getState() : store._state || store.state;
  const fieldIndex = state.imageSelectorDialog.fieldIndex;
  const selectedImageId = state.imageSelectorDialog.selectedImageId;

  // Get the field name from the form
  const selectedItem = store.selectSelectedItem();
  const form = store.selectViewData().form;
  const fieldName = form?.fields[fieldIndex]?.name;

  if (fieldName && selectedItem && selectedImageId) {
    const layoutId = store.selectLayoutId();
    const selectedItemId = store.selectSelectedItemId();

    // Get the selected image object to access its fileId
    const { images } = repository.getState();
    const imageItems = images.items;
    const selectedImage = imageItems[selectedImageId];

    if (!selectedImage) {
      console.error("Selected image not found:", selectedImageId);
      return;
    }

    // Prepare the update object
    const updateObject = { [fieldName]: selectedImageId };

    if (
      selectedItem.type === "sprite" &&
      (selectedItem.width === 0 || selectedItem.height === 0)
    ) {
      const targetImage = Object.entries(images.items)
        .map(([, item]) => item)
        .find((item) => item.fileId === selectedImage.fileId);
      updateObject.width = targetImage?.width || 0;
      updateObject.height = targetImage?.height || 0;
    }

    // Update store optimistically for immediate UI feedback
    const currentItems = store.selectItems();
    const updatedItemData = {
      ...currentItems.items[selectedItemId],
      ...updateObject,
    };
    store.updateSelectedItem(updatedItemData);

    // Dispatch debounced update action to repository
    const { subject } = deps;
    subject.dispatch("layoutEditor.updateElement", {
      layoutId,
      selectedItemId,
      updatedItem: updateObject,
      replace: false,
    });

    // Update fieldResources with the new image URL
    try {
      // Get fileManager for this project
      const fileManager = await fileManagerFactory.getByProject(p);
      const { url } = await fileManager.getFileContent({
        fileId: selectedImage.fileId,
      });

      // Get current fieldResources and update with new image
      const currentResources = state.fieldResources || {};
      const newFieldResources = {
        ...currentResources,
        [fieldName]: { src: url },
      };

      store.setFieldResources(newFieldResources);
    } catch (error) {
      console.error(`Failed to fetch image for ${fieldName}:`, error);
    }
  }

  // Hide dialog
  store.hideImageSelectorDialog();
  render();

  // Re-render the preview
  await renderLayoutPreview(deps);
};

export const handleCancelImageSelection = (deps) => {
  const { store, render } = deps;
  store.hideImageSelectorDialog();
  render();
};

export const handleCloseImageSelectorDialog = (deps) => {
  const { store, render } = deps;
  store.hideImageSelectorDialog();
  render();
};

export const handleDropdownMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const detail = payload._event.detail;
  const item = detail.item || detail;
  const fieldName = store.selectDropdownMenuFieldName();

  // Hide dropdown
  store.hideDropdownMenu();
  render();

  // Handle delete action
  if (item.value === "delete-image") {
    const layoutId = store.selectLayoutId();
    const selectedItemId = store.selectSelectedItemId();

    // Update store optimistically for immediate UI feedback
    const currentItems = store.selectItems();
    const updatedItemData = { ...currentItems.items[selectedItemId] };
    updatedItemData[fieldName] = null;
    store.updateSelectedItem(updatedItemData);

    // Dispatch debounced update action to repository
    const { subject } = deps;
    subject.dispatch("layoutEditor.updateElement", {
      layoutId,
      selectedItemId,
      updatedItem: { [fieldName]: null },
      replace: false,
    });

    // Sync store with updated data
    const { layouts, images } = repository.getState();
    const layout = layouts.items[layoutId];
    store.setItems(layout?.elements || { items: {}, tree: [] });
    store.setImages(images);

    // Update fieldResources to remove the deleted image
    const state = store.getState
      ? store.getState()
      : store._state || store.state;
    const currentResources = state.fieldResources || {};
    const newFieldResources = { ...currentResources };
    delete newFieldResources[fieldName];

    store.setFieldResources(newFieldResources);
    render();

    // Re-render the preview
    await renderLayoutPreview(deps);
  }
};

export const handleDialogueFormChange = async (deps, payload) => {
  const { store, render } = deps;
  const { name, fieldValue } = payload._event.detail;

  // Update the dialogue default values in the store
  store.setDialogueDefaultValue({ name, fieldValue });
  render();

  await renderLayoutPreview(deps);
};

export const handleChoiceFormChange = async (deps, payload) => {
  const { store, render } = deps;
  const { name, fieldValue } = payload._event.detail;

  // Update the choice default values in the store
  store.setChoiceDefaultValue({ name, fieldValue });
  render();

  await renderLayoutPreview(deps);
};

export const handleArrowKeyDown = async (deps, payload) => {
  const { store, render } = deps;

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

  // Update store optimistically for immediate UI feedback
  const updatedItem = { ...currentItem, ...change };
  store.updateSelectedItem(updatedItem);
  render();

  // Render preview immediately for user feedback
  await renderLayoutPreview(deps, { skipAssetLoading: true });

  // Schedule final save after navigation stops
  scheduleKeyboardSave(deps, currentItem.id, layoutId);
};

export const handle2dRenderEvent = async (deps, payload) => {
  const { store } = deps;
  const { eventName } = payload;

  const { isDragging, dragOffset } = store.selectDragging();

  const currentItem = store.selectSelectedItem();
  if (!currentItem) {
    return;
  }

  if (eventName.startsWith("layout-editor-pointer-down")) {
    // Cancel any pending keyboard save when starting drag
    cancelKeyboardSave();

    store.startDragging({
      x: Math.round(payload.x - currentItem.x),
      y: Math.round(payload.y - currentItem.y),
    });
  } else if (eventName.startsWith("layout-editor-pointer-up")) {
    store.stopDragging(false);
    // Final render after drag ends
    setTimeout(() => {
      renderLayoutPreview(deps, { skipAssetLoading: true });
    }, 100);
  } else if (eventName.startsWith("layout-editor-pointer-move")) {
    if (!isDragging) {
      return;
    }

    const change = {
      x: Math.round(payload.x - dragOffset.x),
      y: Math.round(payload.y - dragOffset.y),
    };

    // Update element with optimistic UI (includes dispatch)
    updateElementOptimistically(deps, change, "drag");

    // Render immediately for smooth dragging
    // Skip asset loading during drag since assets don't change
    renderLayoutPreview(deps, { skipAssetLoading: true });
  }
};

/**
 * Handler for debounced element updates (saves to repository)
 * @param {Object} payload - Update payload
 * @param {Object} deps - Component dependencies
 * @param {boolean} skipUIUpdate - Skip UI updates for drag operations
 */
async function handleDebouncedUpdate(deps, payload, skipUIUpdate = false) {
  const { repositoryFactory, router, store, render } = deps;
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

  // For drag operations, UI is already updated optimistically
  if (skipUIUpdate) return;

  // For form/keyboard updates, sync store with repository
  const { layouts, images } = repository.getState();
  const layout = layouts.items[layoutId];

  store.setItems(layout?.elements || { items: {}, tree: [] });
  store.setImages(images);
  render();

  await renderLayoutPreview(deps);
}

export const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    fromEvent(window, "keydown").pipe(
      filter(() => {
        return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          payload._event.key,
        );
      }),
      tap((e) => {
        handleArrowKeyDown(deps, { _event: e });
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "2drendererEvent"),
      tap(({ payload }) => {
        handle2dRenderEvent(deps, payload);
      }),
    ),
    // Debounce regular element updates
    subject.pipe(
      filter(({ action }) => action === "layoutEditor.updateElement"),
      debounceTime(DEBOUNCE_DELAYS.UPDATE),
      tap(async ({ payload }) => {
        await handleDebouncedUpdate(deps, payload, false);
      }),
    ),
    // Debounce drag saves to repository (UI already updated immediately)
    subject.pipe(
      filter(({ action }) => action === "layoutEditor.updateElementDrag"),
      debounceTime(DEBOUNCE_DELAYS.DRAG),
      tap(async ({ payload }) => {
        await handleDebouncedUpdate(deps, payload, true);
      }),
    ),
  ];
};

export const handleSystemActionsChange = async (deps, payload) => {
  const { store, render, router, repositoryFactory } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const layoutId = store.selectLayoutId();
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  selectedItem.eventPayload = {
    actions: payload._event.detail,
  };
  store.updateSelectedItem(selectedItem);
  render();

  // Save to repository
  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.elements`,
    value: {
      id: selectedItemId,
      replace: true,
      item: selectedItem,
    },
  });
};

export const handleSystemActionsActionDelete = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const { actionType } = payload._event.detail;

  // Get current selected item
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = structuredClone(store.selectSelectedItem());
  if (!selectedItem || !selectedItem.eventPayload?.actions) return;

  // Delete the action from the item's actions
  delete selectedItem.eventPayload.actions[actionType];

  // Update the item in the store
  store.updateSelectedItem(selectedItem);
  render();

  // Save to repository
  const layoutId = store.selectLayoutId();
  const repository = await repositoryFactory.getByProject(p);

  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.elements`,
    value: {
      id: selectedItemId,
      replace: true,
      item: selectedItem,
    },
  });
};
