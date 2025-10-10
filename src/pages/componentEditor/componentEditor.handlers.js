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
  const {
    store,
    repositoryFactory,
    router,
    render,
    drenderer,
    fileManagerFactory,
  } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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

  // Get fileManager for this project
  const fileManager = await fileManagerFactory.getByProject(p);

  for (const fileId of fileIds) {
    const { url } = await fileManager.getFileContent({
      fileId: fileId,
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

export const handleAfterMount = async (deps) => {
  const { router, store, repositoryFactory, render, getRefIds, drenderer } =
    deps;
  const { componentId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const { components, images } = repository.getState();
  const component = components.items[componentId];
  store.setComponentId(componentId);
  store.setItems(component?.elements || { items: {}, tree: [] });
  store.setImages({ images });

  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });
  await renderComponentPreview(deps);
  render();
};

export const handleTargetChanged = (deps) => {
  const { render } = deps;
  render();
};

export const handleFileExplorerItemClick = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;
  store.setSelectedItemId(itemId);
  render();
  await renderComponentPreview(deps);
};

export const handleAddComponentClick = (deps) => {
  const { render } = deps;
  render();
};

export const handleDataChanged = async (deps) => {
  const { router, store, repositoryFactory, render } = deps;
  const { componentId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { components } = repository.getState();
  const component = components.items[componentId];
  store.setItems(component?.elements || { items: {}, tree: [] });
  render();
};
