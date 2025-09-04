import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { router, store, repositoryFactory } = deps;
  const { characterId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { characters } = repository.getState();
  const character = characters.items[characterId];

  if (!character) {
    alert("Character not found");
    return () => {};
  }

  store.setCharacterId(characterId);
  store.setItems(character.sprites);
  return () => {};
};

export const handleDataChanged = async (e, deps) => {
  const { router, render, store, repositoryFactory } = deps;
  const { characterId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { characters } = repository.getState();
  const character = characters.items[characterId];

  if (!character) {
    alert("Character not found");
    return;
  }

  store.setItems(character.sprites);
  render();
};

export const handleImageItemClick = async (e, deps) => {
  const { store, render, getFileContent } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();

  const { url } = await getFileContent({
    fileId: selectedItem.fileId,
    projectId: "someprojectId",
  });
  store.setContext({
    fileId: {
      src: url,
    },
  });
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const {
    router,
    store,
    render,
    fileManager,
    uploadImageFiles,
    repositoryFactory,
  } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const characterId = store.selectCharacterId();
  const { characters } = repository.getState();
  const character = characters.items[characterId];

  if (!character) {
    alert("Character not found");
    return;
  }

  // Use fileManager if available, otherwise fall back to uploadImageFiles
  const uploader = fileManager || { upload: uploadImageFiles };

  // Upload all files
  const uploadResults = await uploader.upload(files, "someprojectId");

  // uploadResults already contains only successful uploads
  const successfulUploads = uploadResults;

  if (successfulUploads.length > 0) {
    successfulUploads.forEach((result) => {
      repository.addAction({
        actionType: "treePush",
        target: `characters.items.${characterId}.sprites`,
        value: {
          parent: id,
          position: "last",
          item: {
            id: nanoid(),
            type: "image",
            fileId: result.fileId,
            name: result.displayName,
            fileType: result.file.type,
            fileSize: result.file.size,
          },
        },
      });
    });

    // Update store with the latest repository state
    const { characters } = repository.getState();
    const character = characters.items[characterId];
    store.setItems(character.sprites);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleFormChange = async (e, deps) => {
  const { router, repositoryFactory, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const characterId = store.selectCharacterId();
  const selectedItemId = store.selectSelectedItemId();

  repository.addAction({
    actionType: "treeUpdate",
    target: `characters.items.${characterId}.sprites`,
    value: {
      id: selectedItemId,
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { characters } = repository.getState();
  const character = characters.items[characterId];
  store.setItems(character?.sprites || { items: {}, tree: [] });
  render();
};

export const handleFormExtraEvent = async (_, deps) => {
  const {
    router,
    repositoryFactory,
    store,
    render,
    filePicker,
    uploadImageFiles,
  } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for image replacement");
    return;
  }

  const files = await filePicker.open({
    accept: "image/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  const uploadedFiles = await uploadImageFiles([file], "someprojectId");

  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  const characterId = store.selectCharacterId();

  repository.addAction({
    actionType: "treeUpdate",
    target: `characters.items.${characterId}.sprites`,
    value: {
      id: selectedItem.id,
      replace: false,
      item: {
        fileId: uploadResult.fileId,
        name: uploadResult.file.name,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
        width: uploadResult.dimensions.width,
        height: uploadResult.dimensions.height,
      },
    },
  });

  // Update the store with the new repository state
  const { characters } = repository.getState();
  const character = characters.items[characterId];
  store.setContext({
    fileId: {
      src: uploadResult.downloadUrl,
    },
  });
  store.setItems(character?.sprites || { items: {}, tree: [] });
  render();
};
