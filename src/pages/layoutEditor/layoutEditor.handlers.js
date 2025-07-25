import { toTreeStructure } from "../../deps/repository";
import {
  extractFileIdsFromRenderState,
  layoutTreeStructureToRenderState,
} from "../../utils/index.js";

const renderLayoutPreview = async (deps) => {
  const { store, repository, render, drenderer, httpClient } = deps;
  const layoutId = store.selectLayoutId();

  const {
    layouts,
    images: { items: imageItems },
  } = repository.getState();
  const layout = layouts.items[layoutId];

  const layoutTreeStructure = toTreeStructure(layout.elements);
  const renderStateElements = layoutTreeStructureToRenderState(
    layoutTreeStructure,
    imageItems,
  );

  console.log("=== DEBUG INFO ===");
  console.log(
    "layoutTreeStructure:",
    JSON.stringify(layoutTreeStructure, null, 2),
  );
  console.log(
    "renderStateElements:",
    JSON.stringify(renderStateElements, null, 2),
  );

  const selectedItem = store.selectSelectedItem();
  console.log("selectedItem:", selectedItem);

  const fileIds = extractFileIdsFromRenderState(renderStateElements);

  const assets = {};

  for (const fileId of fileIds) {
    const { url } = await httpClient.creator.getFileContent({
      fileId: fileId,
      projectId: "someprojectId",
    });
    assets[`file:${fileId}`] = {
      url: url,
      type: "image/png",
    };
  }

  // Clear the canvas before loading new assets
  drenderer.render({
    elements: [],
    transitions: [],
  });

  await drenderer.loadAssets(assets);

  // Calculate red dot position if selected
  let elementsToRender = renderStateElements;

  if (selectedItem) {
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

          return { x: absoluteX, y: absoluteY, element };
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

    const result = calculateAbsolutePosition(
      renderStateElements,
      selectedItem.id,
    );

    if (result) {
      console.log("Creating red dot at:", result.x, result.y);
      const redDot = {
        id: "selected-anchor",
        type: "rect",
        x: result.x - 12,
        y: result.y - 12,
        width: 25,
        height: 25,
        fill: "red",
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
        children: [redDot],
      };

      // Add container as the LAST top-level element
      elementsToRender = [...renderStateElements, redDotContainer];
    }
  }

  // Render all elements including red dot
  drenderer.render({
    elements: elementsToRender,
    transitions: [],
  });
};

export const handleBeforeMount = (deps) => {
  const { router, store, repository } = deps;
  const { layoutId } = router.getPayload();
  const { layouts, images } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setLayoutId(layoutId);
  store.setItems(layout?.elements || { items: {}, tree: [] });
  store.setImages(images);
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
  const { store, render } = deps;
  const itemId = e.detail.id;
  store.setSelectedItemId(itemId);
  render();
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

export const handleDetailPanelItemUpdate = async (e, deps) => {
  const { repository, store, render } = deps;
  const layoutId = store.selectLayoutId();
  const selectedItemId = store.selectSelectedItemId();

  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.elements`,
    value: {
      id: selectedItemId,
      replace: false,
      item: e.detail.formValues,
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

export const handleRequestImageGroups = (e, deps) => {
  const { getRefIds, store } = deps;
  const { fieldIndex, currentValue } = e.detail;

  // Get groups from transformed repository data
  const viewData = store.toViewData();
  const groups = viewData.imageGroups;

  // Show dialog with groups using correct ref access pattern
  const refIds = getRefIds();
  const selectedItemId = store.selectSelectedItemId();
  const detailPanelRef = refIds[`detail-panel-${selectedItemId}`];

  if (detailPanelRef && detailPanelRef.elm && detailPanelRef.elm.store) {
    detailPanelRef.elm.store.showImageSelectorDialog({
      fieldIndex,
      groups,
      currentValue,
    });
    detailPanelRef.elm.render();
  }
};

export const handleImageSelectorUpdated = async (e, deps) => {
  const { repository, store, render } = deps;
  const { imageId, fieldIndex } = e.detail;
  const layoutId = store.selectLayoutId();
  const selectedItemId = store.selectSelectedItemId();

  // Get the field name using the proper selector
  const fieldName = store.selectDetailFieldNameByIndex(fieldIndex);

  // Update the selected item with the new image field
  // If imageId is empty string, we set it to null to clear the image
  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.elements`,
    value: {
      id: selectedItemId,
      replace: false,
      item: { [fieldName]: imageId || null },
    },
  });

  const { layouts } = repository.getState();
  const layout = layouts.items[layoutId];

  // Preserve selectedItemId before updating store
  const currentSelectedItemId = store.selectSelectedItemId();

  store.setItems(layout?.elements || { items: {}, tree: [] });

  // Restore selectedItemId after store update
  store.setSelectedItemId(currentSelectedItemId);

  render();
  await renderLayoutPreview(deps);
};
