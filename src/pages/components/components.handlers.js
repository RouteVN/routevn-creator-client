import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { components } = repository.getState();
  store.setItems(components);

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { components } = repository.getState();
  store.setItems(components);
  render();
};

export const handleImageItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleComponentCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name } = e.detail;

  repository.addAction({
    actionType: "treePush",
    target: "components",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "component",
        name: name,
        elements: {
          items: {},
          tree: [],
        },
      },
    },
  });

  const { components } = repository.getState();
  store.setItems(components);
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
      target: "components",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "component",
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
    const { components } = repository.getState();
    store.setItems(components);
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
    target: "components",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { components } = repository.getState();
  store.setItems(components);
  render();
};
