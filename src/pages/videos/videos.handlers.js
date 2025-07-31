import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { videos } = repository.getState();
  store.setItems(videos);

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { videos } = repository.getState();
  store.setItems(videos);
  render();
};

export const handleVideoItemClick = async (e, deps) => {
  const { store, render, getFileContent } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();

  if (selectedItem && selectedItem.thumbnailFileId) {
    const { url } = await getFileContent({
      fileId: selectedItem.thumbnailFileId,
      projectId: "someprojectId",
    });
    store.setContext({
      thumbnailFileId: {
        src: url,
      },
    });
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

export const handleFormExtraEvent = async (e, deps) => {
  const { repository, store, render, filePicker, uploadVideoFiles } = deps;

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

  const uploadedFiles = await uploadVideoFiles([file], "someprojectId");

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

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "videos",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { videos } = repository.getState();
  store.setItems(videos);
  render();
};
