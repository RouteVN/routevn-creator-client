export const handleSystemVariableItemClick = (deps, payload) => {
  const { store, render } = deps;
  const itemId = payload?._event?.detail?.itemId ?? "";
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  render();
};
