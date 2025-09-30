import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { images } = repository.getState();
  store.setItems(images);
  render();
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
    fileManagerFactory,
  } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);

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

  const uploadedFiles = await fileManager.upload([file]);

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
  const { store, render, fileManagerFactory, router } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();

  const { p: projectId } = router.getPayload();
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { url } = await fileManager.getFileContent({
    fileId: selectedItem.fileId,
  });
  store.setContext({
    fileId: {
      src: url,
    },
  });
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, repositoryFactory, router, fileManagerFactory } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await fileManager.upload(files);
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

export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupToggle = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.detail.groupId;

  store.toggleGroupCollapse(groupId);
  render();
};

export const handleZoomChange = (e, deps) => {
  const { store, render, userConfig } = deps;
  const zoomLevel = parseFloat(e.detail?.value || e.target?.value);

  store.setZoomLevel(zoomLevel);

  // Save zoom level to user config
  if (userConfig) {
    userConfig.set("images.zoomLevel", zoomLevel);
  }

  render();
};

export const handleZoomIn = (_, deps) => {
  const { store, render, userConfig } = deps;
  const currentZoom = store.selectCurrentZoomLevel();
  const newZoom = Math.min(4.0, currentZoom + 0.1);

  store.setZoomLevel(newZoom);

  // Save zoom level to user config
  if (userConfig) {
    userConfig.set("images.zoomLevel", newZoom);
  }

  render();
};

export const handleZoomOut = (_, deps) => {
  const { store, render, userConfig } = deps;
  const currentZoom = store.selectCurrentZoomLevel();
  const newZoom = Math.max(0.5, currentZoom - 0.1);

  store.setZoomLevel(newZoom);

  // Save zoom level to user config
  if (userConfig) {
    userConfig.set("images.zoomLevel", newZoom);
  }

  render();
};

export const handleImageDoubleClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail;

  const selectedItem = store.selectSelectedItem();
  if (selectedItem && selectedItem.id === itemId) {
    store.showFullImagePreview(selectedItem.fileId);
    render();
  }
};

export const handlePreviewOverlayClick = (_, deps) => {
  const { store, render } = deps;

  store.hideFullImagePreview();
  render();
};

export const handleOnMount = async (deps) => {
  const { store, render, userConfig } = deps;

  // Load saved zoom level from user config
  if (userConfig) {
    const savedZoom = await userConfig.get("images.zoomLevel");
    if (savedZoom !== null && savedZoom !== undefined) {
      store.setZoomLevel(savedZoom);
      render();
    }
  }
};
