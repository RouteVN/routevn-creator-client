import { toTreeStructure } from "../../deps/repository";

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
      console.log("element", element);
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

export const handleOnMount = async (deps) => {
  const {
    render,
    router,
    store,
    repository,
    getRefIds,
    drenderer,
    httpClient,
  } = deps;
  const { componentId } = router.getPayload();

  const { components, images } = repository.getState();
  const component = components.items[componentId];
  store.setComponentId(componentId);
  store.setItems(component?.layout || { items: {}, tree: [] });
  store.setImages({ images });

  // Build assets object from all images
  const assets = {};
  const imageItems = images.items || {};

  // load images on demand instead of all at once
  for (const [imageId, imageData] of Object.entries(imageItems)) {
    // Skip if fileId is undefined or null
    if (!imageData.fileId) {
      console.warn(`Skipping image ${imageId} - missing fileId`);
      continue;
    }

    const fileKey = `file:${imageData.fileId}`;
    try {
      const { url } = await httpClient.creator.getFileContent({
        fileId: imageData.fileId,
        projectId: "someprojectId",
      });
      assets[fileKey] = {
        url: url,
        type: imageData.fileType,
      };
    } catch (error) {
      console.error(`Failed to load asset for image ${imageId}:`, error);
    }
  }

  render();
  const { canvas } = getRefIds();
  await drenderer.init({ assets, canvas: canvas.elm });
  drenderer.render({
    elements: [],
    transitions: [],
  });
  return () => {};
};

export const handleTargetChanged = (payload, deps) => {
  const { render } = deps;
  render();
};

export const handleFileExplorerItemClick = (e, deps) => {
  const { store, render } = deps;
  const itemId = e.detail.id;
  store.setSelectedItemId(itemId);
  render();
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
  store.setItems(component?.layout || { items: {}, tree: [] });
  render();
};

export const handleDetailPanelItemUpdate = (e, deps) => {
  const { repository, store, render, drenderer } = deps;
  const componentId = store.selectComponentId();

  repository.addAction({
    actionType: "treeUpdate",
    target: `components.items.${componentId}.layout`,
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

  const {
    components,
    images: { items: imageItems },
  } = repository.getState();
  const component = components.items[componentId];

  const componentLayoutTreeStructure = toTreeStructure(component.layout);
  const renderStateElements = componentLayoutTreeStructureToRenderState(
    componentLayoutTreeStructure,
    imageItems,
  );

  store.setItems(component?.layout || { items: {}, tree: [] });
  render();

  const selectedItem = store.selectSelectedItem();

  drenderer.render({
    elements: renderStateElements.concat([
      {
        id: "id1",
        type: "graphics",
        x1: selectedItem.x - 5,
        y1: selectedItem.y - 5,
        x2: 11,
        y2: 11,
        fill: "red",
      },
    ]),
    transitions: [],
  });
};

export const handleRequestImageGroups = (e, deps) => {
  const { getRefIds, store } = deps;
  const { fieldIndex, currentValue } = e.detail;

  console.log("handleRequestImageGroups called");
  console.log("fieldIndex:", fieldIndex);
  console.log("currentValue:", currentValue);

  // Get groups from transformed repository data
  const viewData = store.toViewData();
  const groups = viewData.imageGroups;

  console.log("imageGroups:", groups);

  // Show dialog with groups using correct ref access pattern
  const refIds = getRefIds();
  const detailPanelRef = refIds["detail-panel"];
  console.log("detailPanelRef:", detailPanelRef);

  if (detailPanelRef && detailPanelRef.elm && detailPanelRef.elm.store) {
    console.log("calling showImageSelectorDialog");
    detailPanelRef.elm.store.showImageSelectorDialog({
      fieldIndex,
      groups,
      currentValue,
    });
    detailPanelRef.elm.render();
  } else {
    console.log("detailPanelRef.elm.store not found");
    console.log("detailPanelRef.elm:", detailPanelRef?.elm);
  }
};

export const handleImageSelectorUpdated = (e, deps) => {
  const { repository, store, render } = deps;
  const { fieldIndex, imageId } = e.detail;
  const componentId = store.selectComponentId();

  // Update the selected item with the new imageId
  repository.addAction({
    actionType: "treeUpdate",
    target: `components.items.${componentId}.layout`,
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: { imageId },
    },
  });

  const { components } = repository.getState();
  const component = components.items[componentId];
  store.setItems(component?.layout || { items: {}, tree: [] });
  render();
};
