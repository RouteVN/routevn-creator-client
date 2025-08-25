import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { audio } = repository.getState();
  store.setItems(audio || { tree: [], items: {} });

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
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
  const { store, render, repository, uploadAudioFiles } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await uploadAudioFiles(files, "someprojectId");

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

export const handleFormExtraEvent = async (e, deps) => {
  const {
    repository,
    store,
    render,
    filePicker,
    uploadAudioFiles,
    httpClient,
  } = deps;

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

  const uploadedFiles = await uploadAudioFiles([file], "someprojectId");

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

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
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
