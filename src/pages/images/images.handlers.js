import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { images } = repository.getState();
  store.setItems(images);

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { images } = repository.getState();
  store.setItems(images);
  render();
};

export const handleImageItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, repository, uploadImageFiles } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await uploadImageFiles(files, "someprojectId");
  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "images",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "image",
          fileId: result.fileId,
          name: result.file.name,
          fileType: result.file.type,
          fileSize: result.file.size,
          width: result.dimensions.width,
          height: result.dimensions.height,
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { images } = repository.getState();
    store.setItems(images);
  }

  render();
};

export const handleReplaceItem = async (e, deps) => {
  const { store, render, repository, uploadImageFiles } = deps;
  const { file } = e.detail;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for image replacement");
    return;
  }

  const uploadedFiles = await uploadImageFiles([file], "someprojectId");

  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  repository.addAction({
    actionType: "treeUpdate",
    target: "images",
    value: {
      id: selectedItem.id,
      replace: false,
      item: {
        fileId: uploadResult.fileId,
        name: uploadResult.file.name,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
        width: uploadResult.dimensions.width,
        height: uploadResult.dimensions.height,
      },
    },
  });

  // Update the store with the new repository state
  const { images } = repository.getState();
  store.setItems(images);
  render();
};

export const handleDetailPanelItemUpdate = (e, deps) => {
  const { repository, store, render } = deps;

  repository.addAction({
    actionType: "treeUpdate",
    target: "images",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

  const { images } = repository.getState();
  store.setItems(images);
  render();
};

export const handleFileAction = (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;

  if (detail.value === "rename-item-confirmed") {
    // Get the currently selected item
    const selectedItem = store.selectSelectedItem();
    if (!selectedItem) {
      console.warn("No item selected for rename");
      return;
    }

    // Update the item name in the repository
    repository.addAction({
      actionType: "treeUpdate",
      target: "images",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          name: detail.newName,
        },
      },
    });

    // Update the store with the new repository state
    const { images } = repository.getState();
    store.setItems(images);
    render();
  }
};
