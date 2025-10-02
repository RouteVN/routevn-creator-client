export const handleImageItemClick = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;

  const id = payload._event.currentTarget.id.replace("image-item-", "");

  store.setSelectedImageId({
    imageId: id,
  });

  dispatchEvent(
    new CustomEvent("image-selected", {
      detail: {
        imageId: id,
      },
    }),
  );

  render();
};
