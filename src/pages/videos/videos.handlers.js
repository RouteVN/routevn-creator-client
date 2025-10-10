import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { videos } = repository.getState();
  store.setItems(videos);
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { videos } = repository.getState();
  store.setItems(videos);
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id } = payload._event.detail;

  store.setSelectedItemId(id);
  render();
};

export const handleVideoItemClick = async (deps, payload) => {
  const { store, render, fileManagerFactory, router, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();

  if (selectedItem && selectedItem.thumbnailFileId) {
    const { p: projectId } = router.getPayload();
    const fileManager = await fileManagerFactory.getByProject(projectId);
    const { url } = await fileManager.getFileContent({
      fileId: selectedItem.thumbnailFileId,
    });
    store.setContext({
      thumbnailFileId: {
        src: url,
      },
    });
  }
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, repositoryFactory, router, fileManagerFactory } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await fileManager.upload(files);

  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "videos",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "video",
          fileId: result.fileId,
          thumbnailFileId: result.thumbnailFileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { videos } = repository.getState();
    store.setItems(videos);
  }

  render();
};

export const handleFormExtraEvent = async (deps) => {
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
    console.warn("No item selected for video replacement");
    return;
  }

  const files = await filePicker.open({
    accept: "video/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  const uploadedFiles = await fileManager.upload([file]);

  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  repository.addAction({
    actionType: "treeUpdate",
    target: "videos",
    value: {
      id: selectedItem.id,
      replace: false,
      item: {
        fileId: uploadResult.fileId,
        thumbnailFileId: uploadResult.thumbnailFileId,
        name: uploadResult.file.name,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
      },
    },
  });

  // Update the store with the new repository state
  const { videos } = repository.getState();
  store.setContext({
    thumbnailFileId: {
      src: uploadResult.thumbnailDownloadUrl,
    },
  });
  store.setItems(videos);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "videos",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
    },
  });

  const { videos } = repository.getState();
  store.setItems(videos);
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleVideoItemDoubleClick = async (deps, payload) => {
  const { store, render, fileManagerFactory, router, repositoryFactory } = deps;
  const { itemId } = payload._event.detail;
  const { p: projectId } = router.getPayload();

  // Find the video item
  const repository = await repositoryFactory.getByProject(projectId);
  const { videos } = repository.getState();
  const flatItems = toFlatItems(videos);
  const videoItem = flatItems.find((item) => item.id === itemId);

  if (!videoItem) {
    console.warn("Video item not found:", itemId);
    return;
  }

  // Get video URL
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { url } = await fileManager.getFileContent({
    fileId: videoItem.fileId,
  });

  store.setVideoVisible({
    url,
    fileType: videoItem.fileType,
  });
  render();
};

export const handleOutsideVideoClick = (deps) => {
  const { store, render } = deps;

  store.setVideoNotVisible();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { repositoryFactory, router, store, render } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  repository.addAction({
    actionType: "treeDelete",
    target: resourceType,
    value: {
      id: itemId,
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = repository.getState()[resourceType];
  store.setItems(data);
  render();
};
