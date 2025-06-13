
export const handleTitleClick = (e, deps) => {

  const { subject } = deps;

  subject.dispatch('redirect', {
    path: '/projects/1/scenes/1/editor',
  })
}

export const handleFileExplorerClickItem = (e, deps) => {
  const { subject} = deps;
  subject.dispatch('redirect', {
    path: '/project/scene-editor',
  })
};

export const handleWhiteboardItemPositionChanged = (e, deps) => {
  const { store, render } = deps;
  const { itemId, x, y } = e.detail;
  
  store.updateItemPosition({ itemId, x, y });
  render();
};

export const handleWhiteboardItemSelected = (e, deps) => {
  const { itemId } = e.detail;
  console.log('Item selected:', itemId);
};
