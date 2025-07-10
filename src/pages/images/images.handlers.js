import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { images } = repository.getState();
  store.setItems(images);

  return () => { }
};


export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { images } = repository.getState();
  store.setItems(images);
  render();
};


export const handleImageItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, repository, uploadFiles } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const successfulUploads = await uploadFiles(files, "someprojectId")
  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "images",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "image",
          fileId: result.fileId,
          name: result.file.name,
          fileType: result.file.type,
          fileSize: result.file.size,
          width: result.dimensions?.width,
          height: result.dimensions?.height,
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { images } = repository.getState();
    store.setItems(images);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleReplaceItem = async (e, deps) => {
  const { store, render, httpClient, repository, getImageDimensions } = deps;
  const { file } = e.detail;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn('No item selected for image replacement');
    return;
  }

  try {
    // Get image dimensions before uploading
    const dimensions = await getImageDimensions(file);

    // Upload the new file
    const { uploadUrl, fileId } = await httpClient.creator.uploadFile({
      projectId: "someprojectId",
    });

    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    if (response.ok) {
      console.log("Image replaced successfully:", file.name);

      // Update the selected item in the repository with the new file information
      repository.addAction({
        actionType: "treeUpdate",
        target: "images",
        value: {
          id: selectedItem.id,
          replace: false,
          item: {
            fileId: fileId,
            name: file.name,
            fileType: file.type,
            fileSize: file.size,
            width: dimensions.width,
            height: dimensions.height,
          },
        },
      });

      // Update the store with the new repository state
      const { images } = repository.getState();
      store.setItems(images);
      render();

    } else {
      console.error("Image upload failed:", file.name, response.statusText);
    }
  } catch (error) {
    console.error("Image upload error:", file.name, error);
  }
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
      target: "images",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          name: detail.newName,
        },
      },
    });

    // Update the store with the new repository state
    const { images } = repository.getState();
    store.setItems(images);
    render();
  }
};

