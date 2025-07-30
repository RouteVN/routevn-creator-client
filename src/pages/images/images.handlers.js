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

export const handleFormExtraEvent = async (e, deps) => {
  const { repository, store, render, filePicker, uploadImageFiles } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for image replacement");
    return;
  }

  const files = await filePicker.open({
    accept: "image/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

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
  store.setContext({
    fileId: {
      src: uploadResult.downloadUrl,
    },
  });
  store.setItems(images);
  render();
};

export const handleImageItemClick = async (e, deps) => {
  const { store, render, httpClient } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();

  const { url } = await httpClient.creator.getFileContent({
    fileId: selectedItem.fileId,
    projectId: "someprojectId",
  });
  store.setContext({
    fileId: {
      src: url,
    },
  });
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

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "images",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { images } = repository.getState();
  store.setItems(images);
  render();
};
