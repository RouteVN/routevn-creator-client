export const handleOnMount = (deps) => {
  const { router, store, repository } = deps;
  const { componentId } = router.getPayload();
  const { components } = repository.getState();
  const component = components.items[componentId];
  store.setComponentId(componentId);
  store.setItems(component?.layout || { items: {}, tree: [] });
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