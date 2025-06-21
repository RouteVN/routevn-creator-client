export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { scenes } = repository.getState();
  store.setItems({
    items: scenes,
  });
};

export const handleSceneItemClick = (payload, deps) => {
  const { store, render } = deps;

  // store.setSelectedItemId({
  //   'itemId': payload.itemId
  // })

  store.setMode({
    mode: "current",
  });

  render();
};

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        sceneTransition: {
          sceneId: payload?.sceneId,
        }
      },
    }),
  );
};

export const handleSceneSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};

export const handleBreadcumbSceneTransitionClick = (payload, deps) => {
  const { store, render } = deps;
  store.setMode({
    mode: "current",
  });
  render();
};