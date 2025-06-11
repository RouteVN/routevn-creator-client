
export const handleOnMount = (deps) => {
  const { store, localData, render, getRefIds } = deps;
  const items = localData.backgrounds.toJSONFlat()
  store.setItems(items)
}

export const handleTargetChanged = (payload, deps) => {
  const { store, localData, render } = deps;
  localData.backgrounds.createItem('_root', {
    name: 'New Item',
    level: 0
  })
  store.setItems(localData.backgrounds.toJSONFlat())
  render();
}

export const handleFileExplorerRightClickContainer = (e, deps) => {
  const { store, render } = deps;
  const detail = e.detail;
  store.showDropdownMenuFileExplorerEmpty({
    position: {
      x: detail.x,
      y: detail.y,
    },
  });
  render();
};

export const handleFileExplorerRightClickItem = (e, deps) => {
  const { store, render } = deps;
  store.showDropdownMenuFileExplorerItem({
    position: {
      x: e.detail.x,
      y: e.detail.y,
    },
    id: e.detail.id,
  });
  render();
}

export const handleDropdownMenuClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
}

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render, localData } = deps;
  store.hideDropdownMenu();
  localData.backgrounds.createItem('_root', {
    name: 'New Item',
    level: 0,
  })
  const items = localData.backgrounds.toJSONFlat()
  console.log('items', items)
  store.setItems(items)
  render();
}

export const handleKeyframeRightClick = (e, deps) => {
  e.preventDefault();
  const { store, render } = deps;
  store.showKeyframeDropdownMenu({
    position: {
      x: e.clientX,
      y: e.clientY,
    },
    id: e.detail.id,
  });
  render();
}

export const handleTimelinePreviewMouseMove = (e, deps) => {
  const { store, render } = deps;
  const target = e.target;
  const rect = target.getBoundingClientRect();
  const x = e.clientX - rect.left + 64;

  store.setTimelinePreviewMousePosition({
    x,
  });
  render();
}
