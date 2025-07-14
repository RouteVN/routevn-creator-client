import { toFlatItems } from "../../deps/repository";

export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { images } = repository.getState();
  store.setItems({
    items: images,
  });
};

export const handleOnUpdate = () => {
  
}

export const handleImageSelected = (e, deps) => {
  const { store, render } = deps;

  const { imageId } = e.detail;

  store.setTempSelectedImageId({
    imageId: imageId,
  });

  render();
};

export const handleSubmitClick = (e, deps) => {
  const { dispatchEvent, store } = deps;
  
  const selectedImageId = store.selectSelectedImageId();
  
  if (!selectedImageId) {
    return;
  }
  
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        background: {
          imageId: selectedImageId,
        }
      },
    }),
  );
};

export const handleImageSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  const selectedImageId = store.selectSelectedImageId();

  store.setTempSelectedImageId({
    imageId: selectedImageId,
  });

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

export const handleButtonSelectClickImage = (payload, deps) => {
  const { store, render, repository } = deps;

  const { images } = repository.getState();

  const tempSelectedImageId = store.selectTempSelectedImageId();
  const tempSelectedImage = toFlatItems(images).find(image => image.id === tempSelectedImageId);
  store.setSelectedImageAndFileId({
    imageId: tempSelectedImageId,
    fileId: tempSelectedImage.fileId,
  });
  store.setMode({
    mode: "current",
  });  
  render();
};

