import { nanoid } from "nanoid";
import { filter, tap } from "rxjs";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render, userConfig } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { audio } = repository.getState();
  store.setItems(audio || { tree: [], items: {} });

  // Initialize audio player positions from userConfig
  const defaultLeft = parseInt(
    userConfig.get("resizablePanel.file-explorerWidth"),
  );
  const defaultRight = parseInt(
    userConfig.get("resizablePanel.detail-panelWidth"),
  );
  store.updateAudioPlayerLeft({ width: defaultLeft, userConfig });
  store.updateAudioPlayerRight({ width: defaultRight, userConfig });

  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { audio } = repository.getState();
  const audioData = audio || { tree: [], items: {} };

  store.setItems(audioData);
  render();
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, fileManagerFactory, router } = deps;
  const { id, item, isFolder } = payload._event.detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId(null);
    store.setContext({
      fileId: {
        waveformData: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId(id);

  // If we have item data with waveformDataFileId, set up media context for preview
  if (item && item.waveformDataFileId) {
    const { p: projectId } = router.getPayload();
    const fileManager = await fileManagerFactory.getByProject(projectId);

    const waveformData = await fileManager.downloadMetadata({
      fileId: item.waveformDataFileId,
    });

    store.setContext({
      fileId: {
        waveformData,
      },
    });
  }

  render();
};

export const handleFileExplorerDoubleClick = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();
  if (selectedItem) {
    store.openAudioPlayer({
      fileId: selectedItem.fileId,
      fileName: selectedItem.name,
    });
  }
  render();
};

export const handleAudioItemClick = async (deps, payload) => {
  const { store, render, fileManagerFactory, router, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();

  if (!selectedItem?.waveformDataFileId) {
    // Clear waveform data when no waveformDataFileId
    store.setContext({
      fileId: {
        waveformData: null,
      },
    });
    render();
    return;
  }

  // Get the fileManager for the current project
  const { p: projectId } = router.getPayload();
  const fileManager = await fileManagerFactory.getByProject(projectId);

  const waveformData = await fileManager.downloadMetadata({
    fileId: selectedItem.waveformDataFileId,
  });

  store.setContext({
    fileId: {
      waveformData,
    },
  });
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

  // Add all items to repository
  for (const result of successfulUploads) {
    await repository.addEvent({
      type: "treePush",
      payload: {
        target: "audio",
        value: {
          id: nanoid(),
          type: "audio",
          fileId: result.fileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
          waveformDataFileId: result.waveformDataFileId,
          duration: result.duration,
        },
        options: {
          parent: id,
          position: "last",
        },
      },
    });
  }

  if (successfulUploads.length > 0) {
    const { audio } = repository.getState();
    store.setItems(audio);
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
    console.warn("No item selected for audio replacement");
    return;
  }

  const files = await filePicker.open({
    accept: "audio/*",
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
  await repository.addEvent({
    type: "treeUpdate",
    payload: {
      target: "audio",
      value: {
        fileId: uploadResult.fileId,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
        waveformDataFileId: uploadResult.waveformDataFileId,
        duration: uploadResult.duration,
      },
      options: {
        id: selectedItem.id,
        replace: false,
      },
    },
  });

  // Update the store with the new repository state
  const { audio } = repository.getState();

  // Use the waveform data directly (already normalized)
  const waveformData = uploadResult.waveformData;

  store.setContext({
    fileId: {
      waveformData,
    },
  });
  store.setItems(audio);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addEvent({
    type: "treeUpdate",
    target: "audio",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
    },
  });

  const { audio } = repository.getState();
  store.setItems(audio);
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleAudioItemDoubleClick = async (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;

  const selectedItem = store.selectSelectedItem();
  if (selectedItem && selectedItem.id === itemId) {
    store.openAudioPlayer({
      fileId: selectedItem.fileId,
      fileName: selectedItem.name,
    });
    render();
  }
};

export const handleAudioPlayerClose = (deps) => {
  const { store, render } = deps;

  store.closeAudioPlayer();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { repositoryFactory, router, store, render } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  await repository.addEvent({
    type: "treeDelete",
    payload: {
      target: resourceType,
      value: {
        id: itemId,
      },
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = repository.getState()[resourceType];
  store.setItems(data);
  render();
};

export const handlePanelResize = (deps, payload) => {
  const { store, render, userConfig } = deps;
  const { panelType, width } = payload;
  // Handle file-explorer panel resize to adjust audio player position
  if (panelType === "file-explorer") {
    store.updateAudioPlayerLeft({ width, userConfig });
    render();
  }

  // Handle detail-panel resize to adjust audio player position
  if (panelType === "detail-panel") {
    store.updateAudioPlayerRight({ width, userConfig });
    render();
  }
};

export const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === "panel-resize"),
      tap(({ payload }) => {
        handlePanelResize(deps, payload);
      }),
    ),
  ];
};
