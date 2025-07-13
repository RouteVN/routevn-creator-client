export const handleOnMount = async (deps) => {
  const { render, router, store, repository, getRefIds, drenderer } = deps;
  const { componentId } = router.getPayload();

  console.log("componentId", componentId);

  const { components } = repository.getState();
  const component = components.items[componentId];
  store.setComponentId(componentId);
  store.setItems(component?.layout || { items: {}, tree: [] });

  render();
  const { canvas } = getRefIds();
  await drenderer.init({ assets: {}, canvas: canvas.elm });
  console.log("init init");
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

  const { components } = repository.getState();
  const component = components.items[componentId];
  store.setItems(component?.layout || { items: {}, tree: [] });
  render();

  const selectedItem = store.selectSelectedItem();

  drenderer.render({
    elements: [
      {
        id: "id1",
        type: "graphics",
        x1: selectedItem.x - 5,
        y1: selectedItem.y - 5,
        x2: 11,
        y2: 11,
        fill: "red",
      },
    ],
    transitions: [],
  });
};
