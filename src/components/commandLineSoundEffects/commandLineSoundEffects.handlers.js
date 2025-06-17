export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { audio } = repository.getState();
  store.setItems({
    'items': audio
  })
}

export const handleAudioItemClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    'mode': 'current'
  })

  render();
}

export const handleSubmitClick = (payload, deps) => {
  const { store, render } = deps;

}

export const handleAudioSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    'mode': 'gallery'
  })

  render();
}