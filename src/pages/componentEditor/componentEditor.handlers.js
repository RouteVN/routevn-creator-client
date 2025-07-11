export const handleOnMount = async (deps) => {
  const { render, router, store, repository, getRefIds, drenderer } = deps;
  const { componentId } = router.getPayload();
  const { components } = repository.getState();
  const component = components.items[componentId];
  store.setComponentId(componentId);
  store.setItems(component?.layout || { items: {}, tree: [] });


  render();
  // const renderState = store.selectRenderState()
  // const fileIds = extractFileIdsFromRenderState(renderState);
  // const assets = await createAssetsFromFileIds(fileIds, httpClient);
  const { canvas } = getRefIds()
  await drenderer.init({ assets: {}, canvas: canvas.elm })
  console.log('init init')
  drenderer.render({
    elements: [],
    transitions: []
  })
  return () => { };
};

export const handleTargetChanged = (payload, deps) => {
  const { render } = deps;
  render();
};

export const handleFileExplorerItemClick = (e, deps) => {
  const { store, render } = deps;
  const itemId = e.detail.id;
  console.log('File Explorer item clicked:', itemId);
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
