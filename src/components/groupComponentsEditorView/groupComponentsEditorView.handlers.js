export const handleAddComponentClick = (e, deps) => {
  const { dispatchEvent } = deps;
  
  dispatchEvent(new CustomEvent("component-add-click", {
    bubbles: true,
    composed: true
  }));
};

export const handleComponentItemDoubleClick = (e, deps) => {
  const { subject } = deps;
  const itemId = e.currentTarget.id.replace("component-item-", "");
  
  subject.dispatch('redirect', {
    path: '/project/resources/component-editor',
    payload: {
      componentId: itemId
    }
  });
};

export const handleComponentItemRightClick = (e, deps) => {
  const { store, render } = deps;
  const itemId = e.currentTarget.id.replace("component-item-", "");
  
  store.showDropdownMenuComponentItem({
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