import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { images } = projectService.getState();
  store.setItems(images);
  render();
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { id, item, isFolder } = payload._event.detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId(null);
    store.setContext({
      fileId: {
        src: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId(id);

  // If we have item data with fileId, set up media context for preview
  if (item && item.fileId) {
    const { url } = await projectService.getFileContent(item.fileId);

    store.setContext({
      fileId: {
        src: url,
      },
    });
  }

  render();
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;
  store.showFullImagePreview({ itemId });
  render();
};

export const handleFileExplorerDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const repository = await projectService.getRepository();
  const state = repository.getState();
  store.setItems(state.images);
  render();
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store, render } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  const files = await appService.pickFiles({
    accept: "image/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  const uploadedFiles = await projectService.uploadFiles([file]);

  // TODO improve error handling
  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "images",
      value: {
        fileId: uploadResult.fileId,
        name: uploadResult.displayName,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
        width: uploadResult.dimensions.width,
        height: uploadResult.dimensions.height,
      },
      options: {
        id: selectedItem.id,
        replace: false,
      },
    },
  });

  // Update the store with the new repository state
  const { images } = projectService.getState();
  store.setContext({
    fileId: {
      src: uploadResult.downloadUrl,
    },
  });
  store.setItems(images);
  render();
};

export const handleImageItemClick = async (deps, payload) => {
  const { store, render, projectService, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event

  store.setSelectedItemId(itemId);

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();

  const { url } = await projectService.getFileContent(selectedItem.fileId);
  store.setContext({
    fileId: {
      src: url,
    },
  });

  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  console.log(" payload._event.detail", payload._event.detail);
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await projectService.uploadFiles(files);
  for (const result of successfulUploads) {
    console.log("Uploaded file:", result);
    await projectService.appendEvent({
      type: "treePush",
      payload: {
        target: "images",
        value: {
          id: nanoid(),
          type: "image",
          fileId: result.fileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
          width: result.dimensions.width,
          height: result.dimensions.height,
        },
        options: {
          parent: id,
          position: "last",
        },
      },
    });
  }

  if (successfulUploads.length > 0) {
    const { images } = projectService.getState();
    store.setItems(images);
  }

  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "images",
      value: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const { images } = projectService.getState();
  store.setItems(images);
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  await projectService.appendEvent({
    type: "treeDelete",
    payload: {
      target: resourceType,
      options: {
        id: itemId,
      },
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems(data);
  render();
};
