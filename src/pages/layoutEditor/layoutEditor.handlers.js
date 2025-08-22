import { filter, fromEvent, tap } from "rxjs";
import { toTreeStructure } from "../../deps/repository";
import {
  extractFileIdsFromRenderState,
  layoutTreeStructureToRenderState,
} from "../../utils/index.js";
import { parseAndRender } from "jempl";

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

const renderLayoutPreview = async (deps) => {
  const { store, repository, drenderer, getFileContent } = deps;
  const layoutId = store.selectLayoutId();

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
  const layout = layouts.items[layoutId];

  const choicesData = store.selectChoicesData();

  const layoutTreeStructure = toTreeStructure(layout.elements);

  const renderStateElements = layoutTreeStructureToRenderState(
    layoutTreeStructure,
    imageItems,
    { items: typographyItems },
    { items: colorsItems },
    { items: fontsItems },
  );

  const selectedItem = store.selectSelectedItem();

  // Extract all file IDs from render state (includes both images and fonts)
  const fileIds = extractFileIdsFromRenderState(renderStateElements);

  const assets = {};

  for (const fileId of fileIds) {
    const { url } = await getFileContent({
      fileId: fileId,
      projectId: "someprojectId",
    });

    // Determine file type
    let type = "image/png"; // default for images

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

  await drenderer.loadAssets(assets);

  let elementsToRender = renderStateElements;

  if (selectedItem) {
  }

  const dialogueDefaultValues = store.selectDialogueDefaultValues();
  const data = {
    dialogue: {
      content: dialogueDefaultValues["dialogue-content"],
      character: { name: dialogueDefaultValues["dialogue-character-name"] },
    },
    choice: choicesData,
  };

  // const filteredElements = filterChoiceContainers(elementsToRender);
  const finalElements = parseAndRender(elementsToRender, data);

  // Render all elements including red dot
  drenderer.render({
    elements: finalElements,
    transitions: [],
  });

  setTimeout(() => {
    if (!selectedItem) {
      return;
    }
    const bounds = drenderer.getStageElementBounds();
    console.log("bounds", bounds);
    const result = calculateAbsolutePosition(
      renderStateElements,
      selectedItem.id,
    );

    if (result) {
      const redDot = {
        id: "selected-anchor",
        type: "rect",
        x: result.x - 12,
        y: result.y - 12,
        radius: 12,
        width: 25,
        height: 25,
        fill: "red",
      };

      const border = {
        id: "selected-border",
        type: "rect",
        x: bounds[selectedItem.id].x,
        y: bounds[selectedItem.id].y,
        fill: "transparent",
        width: result.width ?? 0,
        height: result.height ?? 0,
        border: {
          color: "red",
          width: 2,
          alpha: 1,
        },
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
        children: [border, redDot],
      };

      // Add container as the LAST top-level element

      drenderer.render({
        elements: [...finalElements, redDotContainer],
        transitions: [],
      });
    }
  }, 100);
};

export const handleBeforeMount = (deps) => {
  const { router, store, repository } = deps;
  const { layoutId } = router.getPayload();
  const { layouts, images, typography, colors, fonts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setLayoutId(layoutId);
  store.setLayoutType(layout.layoutType);
  store.setItems(layout?.elements || { items: {}, tree: [] });
  store.setImages(images);
  store.setTypographyData(typography || { items: {}, tree: [] });
  store.setColorsData(colors || { items: {}, tree: [] });
  store.setFontsData(fonts || { items: {}, tree: [] });
};

export const handleAfterMount = async (deps) => {
  const { render, getRefIds, drenderer } = deps;
  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });

  await renderLayoutPreview(deps);
  render();
};

export const handleTargetChanged = (payload, deps) => {
  const { render } = deps;
  render();
};

export const handleFileExplorerItemClick = async (e, deps) => {
  const { store, render, getFileContent, repository } = deps;
  const itemId = e.detail.id;
  store.setSelectedItemId(itemId);
  render();

  const selectedItem = store.selectSelectedItem();

  // Fetch image resources for sprite items
  if (selectedItem && selectedItem.type === "sprite") {
    const fieldResources = {};

    // Get images from repository
    const { images } = repository.getState();
    const imageItems = images.items;

    // Fetch URLs for each image field
    const imageFields = ["imageId", "hoverImageId", "clickImageId"];

    for (const fieldName of imageFields) {
      if (selectedItem[fieldName]) {
        try {
          // Get the image object using the imageId
          const image = imageItems[selectedItem[fieldName]];
          if (image && image.fileId) {
            const { url } = await getFileContent({
              fileId: image.fileId,
              projectId: "someprojectId",
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

export const handleAddLayoutClick = (e, deps) => {
  const { render } = deps;
  render();
};

export const handleDataChanged = async (e, deps) => {
  const { router, store, repository, render } = deps;
  const { layoutId } = router.getPayload();
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

export const handleFormChange = async (e, deps) => {
  const { repository, store, render } = deps;
  const layoutId = store.selectLayoutId();
  const selectedItemId = store.selectSelectedItemId();

  let unflattenedUpdate;

  // Handle anchor selection specially
  if (
    e.detail.name === "anchor" &&
    e.detail.fieldValue &&
    typeof e.detail.fieldValue === "object"
  ) {
    // When anchor is selected, update both anchorX and anchorY
    unflattenedUpdate = {
      anchorX: e.detail.fieldValue.x,
      anchorY: e.detail.fieldValue.y,
    };
  } else {
    unflattenedUpdate = unflattenKey(e.detail.name, e.detail.fieldValue);
  }

  const currentItem = store.selectSelectedItem();
  const updatedItem = deepMerge(currentItem, unflattenedUpdate);

  if (e.detail.formValues.contentType === "dialogue.character.name") {
    updatedItem.text = "${dialogue.character.name}";
  }
  if (e.detail.formValues.contentType === "dialogue.content") {
    updatedItem.text = "${dialogue.content}";
  }

  if (e.detail.formValues?.contentType?.startsWith("choice.items[")) {
    updatedItem.text = `\$\{${e.detail.formValues.contentType}\}`;
  }

  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.elements`,
    value: {
      id: selectedItemId,
      replace: true,
      item: updatedItem,
    },
  });

  // Sync store with updated repository data
  const { layouts, images } = repository.getState();
  const layout = layouts.items[layoutId];

  store.setItems(layout?.elements || { items: {}, tree: [] });
  store.setImages(images);
  render();

  await renderLayoutPreview(deps);
};

export const handleFormExtraEvent = async (e, deps) => {
  const { store, render } = deps;
  const { trigger, name, fieldIndex } = e.detail;

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
      const imageGroups = store.toViewData().imageGroups;

      // Find the field index by matching the field name
      const form = store.toViewData().form;
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
      e.preventDefault();
      store.showDropdownMenuForImageField({
        position: { x: e.detail.x, y: e.detail.y },
        fieldName: name,
      });
      render();
    }
  }
};

export const handleImageSelectorSelection = (e, deps) => {
  const { store, render } = deps;
  const { imageId } = e.detail;

  store.setTempSelectedImageId({ imageId });
  render();
};

export const handleConfirmImageSelection = async (e, deps) => {
  const { store, render, repository, getFileContent } = deps;

  const state = store.getState ? store.getState() : store._state || store.state;
  const fieldIndex = state.imageSelectorDialog.fieldIndex;
  const selectedImageId = state.imageSelectorDialog.selectedImageId;

  // Get the field name from the form
  const selectedItem = store.selectSelectedItem();
  const form = store.toViewData().form;
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
        .map(([id, item]) => item)
        .find((item) => item.fileId === selectedImage.fileId);
      updateObject.width = targetImage?.width || 0;
      updateObject.height = targetImage?.height || 0;
    }

    // Update the repository with the image's fileId and possibly dimensions
    repository.addAction({
      actionType: "treeUpdate",
      target: `layouts.items.${layoutId}.elements`,
      value: {
        id: selectedItemId,
        replace: false,
        item: updateObject,
      },
    });

    // Sync store with updated repository data
    const { layouts, images: updatedImages } = repository.getState();
    const layout = layouts.items[layoutId];

    store.setItems(layout?.elements || { items: {}, tree: [] });
    store.setImages(updatedImages);

    // Update fieldResources with the new image URL
    try {
      const { url } = await getFileContent({
        fileId: selectedImage.fileId,
        projectId: "someprojectId",
      });

      // Get current fieldResources and update with new image
      const currentResources = state.fieldResources || {};
      const newFieldResources = {
        ...currentResources,
        [fieldName]: { src: url },
      };

      store.setFieldResources(newFieldResources);

      // Get updated selected item after repository update
      const updatedSelectedItem = store.selectSelectedItem();
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

export const handleCancelImageSelection = (e, deps) => {
  const { store, render } = deps;
  store.hideImageSelectorDialog();
  render();
};

export const handleCloseImageSelectorDialog = (e, deps) => {
  const { store, render } = deps;
  store.hideImageSelectorDialog();
  render();
};

export const handleDropdownMenuClose = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;
  const item = detail.item || detail;
  const fieldName = store.selectDropdownMenuFieldName();

  // Hide dropdown
  store.hideDropdownMenu();
  render();

  // Handle delete action
  if (item.value === "delete-image") {
    const layoutId = store.selectLayoutId();
    const selectedItemId = store.selectSelectedItemId();

    // Update the repository to remove the image
    repository.addAction({
      actionType: "treeUpdate",
      target: `layouts.items.${layoutId}.elements`,
      value: {
        id: selectedItemId,
        replace: false,
        item: { [fieldName]: null },
      },
    });

    // Sync store with updated repository data
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

export const handleDialogueFormChange = async (e, deps) => {
  const { store, render } = deps;
  const { name, fieldValue } = e.detail;

  // Update the dialogue default values in the store
  store.setDialogueDefaultValue({ name, fieldValue });
  render();

  await renderLayoutPreview(deps);
};

export const handleChoiceFormChange = async (e, deps) => {
  const { store, render } = deps;
  const { name, fieldValue } = e.detail;

  // Update the choice default values in the store
  store.setChoiceDefaultValue({ name, fieldValue });
  render();

  await renderLayoutPreview(deps);
};

export const handleArrowKeyDown = async (e, deps) => {
  const { store, repository, render } = deps;

  const currentItem = store.selectSelectedItem();
  if (!currentItem) {
    return;
  }

  const unit = e.shiftKey ? 10 : 1;
  let change = {};

  const layoutId = store.selectLayoutId();

  if (e.key === "ArrowUp") {
    if (e.metaKey) {
      change = {
        height: currentItem.height - unit,
      };
    } else {
      change = {
        y: currentItem.y - unit,
      };
    }
  } else if (e.key === "ArrowDown") {
    if (e.metaKey) {
      change = {
        height: currentItem.height + unit,
      };
    } else {
      change = {
        y: currentItem.y + unit,
      };
    }
  } else if (e.key === "ArrowLeft") {
    if (e.metaKey) {
      change = {
        width: currentItem.width - unit,
      };
    } else {
      change = {
        x: currentItem.x - unit,
      };
    }
  } else if (e.key === "ArrowRight") {
    if (e.metaKey) {
      change = {
        width: currentItem.width + unit,
      };
    } else {
      change = {
        x: currentItem.x + unit,
      };
    }
  }

  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.elements`,
    value: {
      id: currentItem.id,
      replace: false,
      item: change,
    },
  });

  // Sync store with updated repository data
  const { layouts } = repository.getState();
  const layout = layouts.items[layoutId];
  //
  store.setItems(layout?.elements || { items: {}, tree: [] });
  render();

  await renderLayoutPreview(deps);
};

export const subscriptions = (deps) => {
  return [
    fromEvent(window, "keydown").pipe(
      filter((e) => {
        return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.key,
        );
      }),
      tap((e) => {
        handleArrowKeyDown(e, deps);
      }),
    ),
  ];
};
