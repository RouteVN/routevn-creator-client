import { toTreeStructure } from "../../deps/repository";
import { extractFileIdsFromRenderState } from "../../utils/index.js";

// loop through the tree structure and map
const componentLayoutTreeStructureToRenderState = (layout, imageItems) => {
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
        text: node.text,
        style: {
          fontSize: 24,
          fill: "white",
          wordWrapWidth: 300,
        },
      };
    }

    if (node.type === "sprite") {
      const imageItem = imageItems[node.imageId];
      element.url = `file:${imageItem.fileId}`;
    }

    // Map children recursively while maintaining tree structure
    if (node.children && node.children.length > 0) {
      element.children = node.children.map(mapNode);
    }

    return element;
  };

  return layout.map(mapNode);
};

const renderComponentPreview = async (deps) => {
  const { store, repository, render, drenderer, httpClient } = deps;
  const componentId = store.selectComponentId();

  const {
    components,
    images: { items: imageItems },
  } = repository.getState();
  const component = components.items[componentId];

  const componentLayoutTreeStructure = toTreeStructure(component.elements);
  const renderStateElements = componentLayoutTreeStructureToRenderState(
    componentLayoutTreeStructure,
    imageItems,
  );

  store.setItems(component?.elements || { items: {}, tree: [] });
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
          type: "rect",
          x: selectedItem.x - 5,
          y: selectedItem.y - 5,
          width: 11,
          height: 11,
          fill: "red",
        },
      ])
    : renderStateElements;

  drenderer.render({
    elements,
    transitions: [],
  });
};

export const handleBeforeMount = (deps) => {
  const { router, store, repository } = deps;
  const { componentId } = router.getPayload();

  const { components, images } = repository.getState();
  const component = components.items[componentId];
  store.setComponentId(componentId);
  store.setItems(component?.elements || { items: {}, tree: [] });
  store.setImages({ images });
};

export const handleAfterMount = async (deps) => {
  const { render, getRefIds, drenderer } = deps;
  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });
  await renderComponentPreview(deps);
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
  await renderComponentPreview(deps);
};

export const handleAddComponentClick = (e, deps) => {
  const { render } = deps;
  render();
};

export const handleDataChanged = (e, deps) => {
  const { router, store, repository, render } = deps;
  const { componentId } = router.getPayload();
  const { components } = repository.getState();
  const component = components.items[componentId];
  store.setItems(component?.elements || { items: {}, tree: [] });
  render();
};

export const handleDetailPanelItemUpdate = async (e, deps) => {
  const { repository, store } = deps;
  const componentId = store.selectComponentId();

  repository.addAction({
    actionType: "treeUpdate",
    target: `components.items.${componentId}.elements`,
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

  await renderComponentPreview(deps);
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
  const componentId = store.selectComponentId();

  // Update the selected item with the new imageId
  repository.addAction({
    actionType: "treeUpdate",
    target: `components.items.${componentId}.elements`,
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: { imageId },
    },
  });

  const { components } = repository.getState();
  const component = components.items[componentId];
  store.setItems(component?.elements || { items: {}, tree: [] });
  render();
};
