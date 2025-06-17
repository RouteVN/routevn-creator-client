export const handleOnMount = (deps) => {
  const { router, store, repository } = deps;
  const { layoutId } = router.getPayload();
  const { layouts } = repository.getState();
  const layout = layouts.items[layoutId];
  store.setLayoutId(layoutId);
  store.setItems(layout?.layout || { items: {}, tree: [] });
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