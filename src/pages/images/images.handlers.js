import { toFlatItems } from '../../repository';

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { images } = repository.getState();
  const items = toFlatItems(images);
  store.setItems(items);
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
  const { store, render, repository } = deps;

  const { item } = e.detail;
  if (item.value === 'new-item') {
    const { images } = repository.getState();
    const lastItem = images.tree[images.tree.length - 1]?.id;
    const previousSibling = lastItem ? lastItem : undefined;
    repository.addAction({
      actionType: 'treePush',
      target: 'images',
      value: {
        parent: '_root',
        previousSibling,
        item: {
          id: 'image' + Date.now(),
          name: 'New Item',
        }
      }
    })
  } else if (item.value === 'rename-item') {
    const itemId = store.selectDropdownMenuItemId();
    const { x, y } = store.selectDropdownMenuPosition();
    store.showPopover({ 
      position: { x, y }, 
      itemId 
    });
  } else if (item.value === 'delete-item') {
    const itemId = store.selectDropdownMenuItemId();
    const { images } = repository.getState();
    const currentItem = images.items[itemId];
    
    if (currentItem) {
      repository.addAction({
        actionType: 'treeDelete',
        target: 'images',
        value: {
          id: itemId
        }
      });
    }
  } else if (item.value === 'new-child-folder') {
    const itemId = store.selectDropdownMenuItemId();
    const { images } = repository.getState();
    const currentItem = images.items[itemId];
    const lastItem = images.tree[images.tree.length - 1]?.id;
    const previousSibling = lastItem ? lastItem : undefined;

    if (currentItem) {
      repository.addAction({
        actionType: 'treePush',
        target: 'images',
        value: {
          parent: itemId,
          previousSibling,
          item: {
            id: 'image' + Date.now(),
            name: 'New Folder',
          }
        }
      });
    }
  }


  store.hideDropdownMenu();
  const { images } = repository.getState();
  const items = toFlatItems(images);
  store.setItems(items)
  render();
}

export const handleAssetItemClick = (e, deps) => {
  const { subject, store } = deps;
  const id = e.target.id.split('-')[2];
  const assetItem = store.selectAssetItem(id);
  subject.dispatch('redirect', {
    path: assetItem.path,
  })
}

export const handlePopoverClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
}

export const handleFormActionClick = (e, deps) => {
  const { store, render, repository } = deps;
  const { formValues, actionId } = e.detail;
  
  if (actionId === 'submit' && formValues.name) {
    const itemId = store.selectPopoverItem()?.id;
    if (itemId) {
      repository.addAction({
        actionType: 'treeUpdate',
        target: 'images',
        value: {
          id: itemId,
          replace: false,
          item: {
            name: formValues.name
          }
        }
      });
      
      // Update local state
      const { images } = repository.getState();
      const items = toFlatItems(images);
      store.setItems(items);
    }
  }
  
  store.hidePopover();
  render();
}
