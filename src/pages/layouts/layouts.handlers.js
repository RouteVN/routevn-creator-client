import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { layouts } = repository.getState();
  store.setItems(layouts);

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { layouts } = repository.getState();
  store.setItems(layouts);
  render();
};

export const handleImageItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleLayoutCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name, layoutType } = e.detail;

  repository.addAction({
    actionType: "treePush",
    target: "layouts",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "layout",
        name: name,
        layoutType: layoutType,
        elements: {
          items: {},
          tree: [],
        },
      },
    },
  });

  const { layouts } = repository.getState();
  store.setItems(layouts);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, fileManager, uploadImageFiles, repository } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Use fileManager if available, otherwise fall back to uploadImageFiles
  const uploader = fileManager || { upload: uploadImageFiles };

  // Upload all files
  const uploadResults = await uploader.upload(files, "someprojectId");

  // uploadResults already contains only successful uploads
  const successfulUploads = uploadResults;

  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "layouts",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "layout",
          fileId: result.fileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
          elements: {
            items: {},
            tree: [],
          },
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { layouts } = repository.getState();
    store.setItems(layouts);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "layouts",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { layouts } = repository.getState();
  store.setItems(layouts);
  render();
};
