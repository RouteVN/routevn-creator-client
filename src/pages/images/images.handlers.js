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
  store.hideDropdownMenu();

  repository.addAction({
    actionType: 'arrayPush',
    target: 'images',
    value: {
      id: 'image1' + Math.random(),
      name: 'New Item',
      children: [],
    }
  })

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
