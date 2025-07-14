import { toTreeStructure } from "../../deps/repository";
import { extractFileIdsFromRenderState } from "../../utils/index.js";

// loop through the tree structure and map
const layoutTreeStructureToRenderState = (layout, imageItems) => {
  const mapNode = (node) => {
    let element = {
      id: node.id,
      type: node.type,
      x: parseInt(node.x),
      y: parseInt(node.y),
    };

    if (node.type === "text") {
      element = {
        ...element,
        text: node.textContent,
        style: {
          fontSize: 24,
          fill: "white",
          wordWrapWidth: 300,
        },
      };
    }

    if (node.type === "sprite" && node.imageId) {
      const imageItem = imageItems[node.imageId];
      if (imageItem && imageItem.fileId) {
        element.url = `file:${imageItem.fileId}`;
      }
    }

    // Map children recursively while maintaining tree structure
    if (node.children && node.children.length > 0) {
      element.children = node.children.map(mapNode);
    }

    return element;
  };

  return layout.map(mapNode);
};

const renderLayoutPreview = async (deps) => {
  const { store, repository, render, drenderer, httpClient } = deps;
  const layoutId = store.selectLayoutId();

  const {
    layouts,
    images: { items: imageItems },
  } = repository.getState();
  const layout = layouts.items[layoutId];

  const layoutTreeStructure = toTreeStructure(layout.layout);
  const renderStateElements = layoutTreeStructureToRenderState(
    layoutTreeStructure,
    imageItems,
  );

  store.setItems(layout?.layout || { items: {}, tree: [] });
  render();

  const selectedItem = store.selectSelectedItem();

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

  await drenderer.loadAssets(assets);

  const elements = selectedItem
    ? renderStateElements.concat([
        {
          id: "id1",
          type: "graphics",
          x1: selectedItem.x - 5,
          y1: selectedItem.y - 5,
          x2: 11,
          y2: 11,
          fill: "red",
        },
      ])
    : renderStateElements;

  drenderer.render({
    elements,
    transitions: [],
  });
};

export const handleOnMount = async (deps) => {
  const { render, router, store, repository, getRefIds, drenderer } = deps;
  const { layoutId } = router.getPayload();

  const { layouts, images } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setLayoutId(layoutId);
  store.setItems(layout?.layout || { items: {}, tree: [] });
  store.setImages(images);

  render();
  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });

  await renderLayoutPreview(deps);

  return () => {};
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

export const handleDataChanged = (e, deps) => {
  const { router, store, repository, render } = deps;
  const { layoutId } = router.getPayload();
  const { layouts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setItems(layout?.layout || { items: {}, tree: [] });
  render();
};

export const handleDetailPanelItemUpdate = async (e, deps) => {
  const { repository, store } = deps;
  const layoutId = store.selectLayoutId();

  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.layout`,
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

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
  const detailPanelRef = refIds["detail-panel"];

  if (detailPanelRef && detailPanelRef.elm && detailPanelRef.elm.store) {
    detailPanelRef.elm.store.showImageSelectorDialog({
      fieldIndex,
      groups,
      currentValue,
    });
    detailPanelRef.elm.render();
  }
};

export const handleImageSelectorUpdated = (e, deps) => {
  const { repository, store, render } = deps;
  const { imageId } = e.detail;
  const layoutId = store.selectLayoutId();

  // Update the selected item with the new imageId
  repository.addAction({
    actionType: "treeUpdate",
    target: `layouts.items.${layoutId}.layout`,
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: { imageId },
    },
  });

  const { layouts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setItems(layout?.layout || { items: {}, tree: [] });
  render();
};
