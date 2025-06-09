export const handleOnMount = (deps) => {
  const { store, localData } = deps;
  store.setItems(localData.backgrounds.toJSONFlat())
  deps.render();
}

export const handleTargetChanged = (payload, deps) => {
  const { store, localData } = deps;
  localData.backgrounds.createItem('_root', {
    name: 'New Item',
    level: 0
  })
  store.setItems(localData.backgrounds.toJSONFlat())
  deps.render();
}
