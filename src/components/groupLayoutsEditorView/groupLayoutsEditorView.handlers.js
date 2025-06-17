export const handleAddLayoutClick = (e, deps) => {
  const { dispatchEvent } = deps;
  
  dispatchEvent(new CustomEvent("layout-add-click", {
    bubbles: true,
    composed: true
  }));
};

export const handleLayoutItemDoubleClick = (e, deps) => {
  const { subject } = deps;
  const itemId = e.currentTarget.id.replace("layout-item-", "");
  
  subject.dispatch('redirect', {
    path: '/project/resources/layout-editor',
    payload: {
      layoutId: itemId
    }
  });
};

export const handleLayoutItemRightClick = (e, deps) => {
  const { store, render } = deps;
  const itemId = e.currentTarget.id.replace("layout-item-", "");
  
  store.showDropdownMenuLayoutItem({
    position: {
      x: e.detail.x,
      y: e.detail.y,
    },
    id: itemId,
  });
  render();
};

export const handleDropdownMenuClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render } = deps;
  const value = e.detail.value;
  
  store.hideDropdownMenu();
  render();
};