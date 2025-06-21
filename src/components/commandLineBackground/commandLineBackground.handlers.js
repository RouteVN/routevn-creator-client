export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { images } = repository.getState();
  store.setItems({
    items: images,
  });
};

export const handleOnUpdate = () => {
  console.log('on update')
}

export const handleImageItemClick = (e, deps) => {
  const { store, render } = deps;

  const id = e.currentTarget.id.replace('image-item-', '');

  store.setTempSelectedImageId({
    imageId: id,
  });


  // store.setMode({
  //   mode: "current",
  // });

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


