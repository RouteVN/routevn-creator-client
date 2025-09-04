import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { images } = repository.getState();
  store.setItems(images);
};

export const handleFileExplorerDataChanged = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { images } = repository.getState();
  store.setItems(images);
  render();
};

export const handleFormExtraEvent = async (e, deps) => {
  const {
    repositoryFactory,
    router,
    store,
    render,
    filePicker,
    uploadImageFiles,
  } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
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

  // TODO improve error handling
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
        name: uploadResult.displayName,
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
  const { store, render, getFileContent } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();

  const { url } = await getFileContent({
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
  const { store, render, repositoryFactory, router, uploadImageFiles } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await uploadImageFiles(files, "someprojectId");
  successfulUploads.forEach((result) => {
    console.log("Uploaded file:", result);
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
          name: result.displayName,
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

export const handleFormChange = async (e, deps) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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
