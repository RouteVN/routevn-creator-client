export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { characters } = repository.getState();
  store.setItems({
    'items': characters
  })
}

export const handleCharacterItemClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    'mode': 'current'
  })

  render();
}

export const handleSubmitClick = (payload, deps) => {
  const { store, render } = deps;

}

export const handleCharacterSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    'mode': 'gallery'
  })

  render();
}