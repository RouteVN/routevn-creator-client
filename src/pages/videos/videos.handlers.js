
import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { videos } = repository.getState();
  store.setItems(videos);

  return () => {}
};


export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { videos } = repository.getState();
  store.setItems(videos);
  render();
};


export const handleVideoItemClick = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  
  // Get the selected item to check if it's a video
  const { videos } = repository.getState();
  const flatItems = toFlatItems(videos);
  const selectedItem = flatItems.find(item => item.id === itemId);
  
  // If it's a video and we don't have the URL cached, fetch it
  if (selectedItem && selectedItem.type === 'video' && selectedItem.fileId) {
    const state = store.getState();
    if (!state.videoUrls[selectedItem.fileId]) {
      try {
        const { url } = await httpClient.creator.getFileContent({ 
          fileId: selectedItem.fileId, 
          projectId: 'someprojectId' 
        });
        store.setVideoUrl({ fileId: selectedItem.fileId, url });
      } catch (error) {
        console.error('Error fetching video URL:', error);
      }
    }
  }
  
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, repository, uploadVideoFiles } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await uploadVideoFiles(files, "someprojectId");

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
          name: result.file.name,
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

export const handleReplaceItem = async (e, deps) => {
  const { store, render, repository, uploadVideoFiles } = deps;
  const { file } = e.detail;
  
  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn('No item selected for video replacement');
    return;
  }
  
  const uploadedFiles = await uploadVideoFiles([file], "someprojectId");
  
  if (uploadedFiles.length === 0) {
    console.error('File upload failed, no files uploaded');
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
  store.setItems(videos);
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
      target: "videos",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          name: detail.newName,
        },
      },
    });
    
    // Update the store with the new repository state
    const { videos } = repository.getState();
    store.setItems(videos);
    render();
  }
};
