
import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { audio } = repository.getState();
  store.setItems(audio || { tree: [], items: {} })

  return () => {}
}

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { audio } = repository.getState();
  const audioData = audio || { tree: [], items: {} };
  
  store.setItems(audioData);
  render();
};

export const handleAudioItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, repository, uploadAudioFiles } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await uploadAudioFiles(files, "someprojectId");

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
          name: result.file.name,
          fileType: result.file.type,
          fileSize: result.file.size,
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { audio } = repository.getState();
    store.setItems(audio);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleReplaceItem = async (e, deps) => {
  const { store, render, repository, uploadAudioFiles } = deps;
  const { file } = e.detail;
  
  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn('No item selected for audio replacement');
    return;
  }
  
  const uploadedFiles = await uploadAudioFiles([file], "someprojectId");
  
  if (uploadedFiles.length === 0) {
    console.error('File upload failed, no files uploaded');
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
        name: uploadResult.file.name,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
      },
    },
  });
  
  // Update the store with the new repository state
  const { audio } = repository.getState();
  store.setItems(audio);
  render();
};

export const handleFileAction = (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;
  
  if (detail.value === 'rename-item-confirmed') {
    // Get the currently selected item
    const selectedItem = store.selectSelectedItem();
    if (!selectedItem) {
      console.warn('No item selected for rename');
      return;
    }
    
    // Update the item name in the repository
    repository.addAction({
      actionType: "treeUpdate",
      target: "audio",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          name: detail.newName,
        },
      },
    });
    
    // Update the store with the new repository state
    const { audio } = repository.getState();
    store.setItems(audio);
    render();
  }
};
