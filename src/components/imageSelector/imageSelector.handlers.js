export const handleImageItemClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;

  const id = e.currentTarget.id.replace("image-item-", "");

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
