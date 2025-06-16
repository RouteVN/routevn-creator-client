
export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { audio } = repository.getState();
  store.setItems(audio || { tree: [], items: {} })

  return () => {}
}

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  console.log("🎵 Audio handleDataChanged received event:", e.detail);
  
  const repositoryState = repository.getState();
  const { audio } = repositoryState;
  
  console.log("🎵 Repository state:", {
    audio,
    fullState: repositoryState
  });
  
  const audioData = audio || { tree: [], items: {} };
  console.log("🎵 Setting audio data:", audioData);
  
  store.setItems(audioData);
  console.log("🎵 Audio store updated, triggering render");
  render();
  console.log("🎵 Audio render completed");
};

// export const handleTargetChanged = (payload, deps) => {
//   const { store, localData, render } = deps;
//   localData.backgrounds.createItem('_root', {
//     name: 'New Item',
//     level: 0
//   })
//   store.setItems(localData.backgrounds.toJSONFlat())
//   render();
// }

// export const handleFileExplorerRightClickContainer = (e, deps) => {
//   const { store, render } = deps;
//   const detail = e.detail;
//   store.showDropdownMenuFileExplorerEmpty({
//     position: {
//       x: detail.x,
//       y: detail.y,
//     },
//   });
//   render();
// };

// export const handleFileExplorerRightClickItem = (e, deps) => {
//   const { store, render } = deps;
//   store.showDropdownMenuFileExplorerItem({
//     position: {
//       x: e.detail.x,
//       y: e.detail.y,
//     },
//     id: e.detail.id,
//   });
//   render();
// }

// export const handleDropdownMenuClickOverlay = (e, deps) => {
//   const { store, render } = deps;
//   store.hideDropdownMenu();
//   render();
// }

// export const handleDropdownMenuClickItem = (e, deps) => {
//   const { store, render, localData } = deps;
//   store.hideDropdownMenu();
//   localData.backgrounds.createItem('_root', {
//     name: 'New Item',
//     level: 0,
//   })
//   const items = localData.backgrounds.toJSONFlat()
//   console.log('items', items)
//   store.setItems(items)
//   render();
// }


// export const handleAssetItemClick = (e, deps) => {
//   const { subject, store } = deps;
//   const id = e.target.id.split('-')[2];
//   const assetItem = store.selectAssetItem(id);
//   subject.dispatch('redirect', {
//     path: assetItem.path,
//   })
// }
