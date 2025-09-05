import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { audio } = repository.getState();
  store.setItems(audio || { tree: [], items: {} });
  render();
};

export const handleDataChanged = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { audio } = repository.getState();
  const audioData = audio || { tree: [], items: {} };

  store.setItems(audioData);
  render();
};

export const handleAudioItemClick = async (e, deps) => {
  const { store, render, downloadWaveformData } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();

  const waveformData = await downloadWaveformData({
    fileId: selectedItem.waveformDataFileId,
  });

  store.setContext({
    fileId: {
      waveformData,
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

  // Add all items to repository
  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "audio",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "audio",
          fileId: result.fileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
          waveformDataFileId: result.waveformDataFileId,
          duration: result.duration,
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { audio } = repository.getState();
    store.setItems(audio);
  }

  render();
};

export const handleFormExtraEvent = async (_, deps) => {
  const {
    repositoryFactory,
    router,
    store,
    render,
    filePicker,
    fileManagerFactory,
    httpClient,
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
  repository.addAction({
    actionType: "treeUpdate",
    target: "audio",
    value: {
      id: selectedItem.id,
      replace: false,
      item: {
        fileId: uploadResult.fileId,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
        waveformDataFileId: uploadResult.waveformDataFileId,
        duration: uploadResult.duration,
      },
    },
  });

  // Update the store with the new repository state
  const { audio } = repository.getState();
  store.setContext({
    fileId: {
      waveformData: uploadResult.waveformData,
    },
  });
  store.setItems(audio);
  render();
};

export const handleFormChange = async (e, deps) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "audio",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { audio } = repository.getState();
  store.setItems(audio);
  render();
};
