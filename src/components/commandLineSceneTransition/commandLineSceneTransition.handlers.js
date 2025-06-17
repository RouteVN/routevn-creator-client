export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { scenes } = repository.getState();
  store.setItems({
    'items': scenes
  })
}

export const handleSceneItemClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    'mode': 'current'
  })

  render();
}

export const handleSubmitClick = (payload, deps) => {
  const { store, render } = deps;

}

export const handleSceneSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    'mode': 'gallery'
  })

  render();
}