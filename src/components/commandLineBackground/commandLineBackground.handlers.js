export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { images } = repository.getState();
  store.setItems({
    items: images,
  });
};

export const handleImageItemClick = (payload, deps) => {
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
        background: {
          imageId: payload?.imageId,
        }
      },
    }),
  );
};

export const handleImageSelectorClick = (payload, deps) => {
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

export const handleBreadcumbBackgroundClick = (payload, deps) => {
  const { store, render } = deps;
  store.setMode({
    mode: "current",
  });
  render();
};


