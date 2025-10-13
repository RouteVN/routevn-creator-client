import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { router, store, repositoryFactory, render, globalUI } = deps;
  const { characterId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { characters } = repository.getState();
  const character = characters.items[characterId];

  if (!character) {
    globalUI.showAlert({ message: "Character not found", title: "Error" });
  }

  store.setCharacterId(characterId);
  store.setItems(character.sprites);
  render();
};

export const handleDataChanged = async (deps) => {
  const { router, render, store, repositoryFactory, globalUI } = deps;
  const { characterId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { characters } = repository.getState();
  const character = characters.items[characterId];

  if (!character) {
    globalUI.showAlert({ message: "Character not found", title: "Error" });
    return;
  }

  store.setItems(character.sprites);
  render();
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, fileManagerFactory, router } = deps;
  const { id, item, isFolder } = payload._event.detail;
  console.log("Selection changed:", id, item, isFolder);

  // For characterSprites, get item data from our own store since BaseFileExplorer
  // can't access the nested character.sprites data structure
  let actualItem = item;
  if (!actualItem) {
    // Get the item from our store's spritesData
    const flatItems = store.selectFlatItems();
    actualItem = flatItems.find((item) => item.id === id) || null;
  }

  // Check if this is a folder (either from BaseFileExplorer or from our own data)
  const actualIsFolder =
    isFolder || (actualItem && actualItem.type === "folder");

  // If this is a folder, clear selection and context
  if (actualIsFolder) {
    store.setSelectedItemId(null);
    store.setContext({
      fileId: {
        src: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId(id);

  // If we have item data with fileId, set up media context for preview
  if (actualItem && actualItem.fileId) {
    const { p: projectId } = router.getPayload();
    const fileManager = await fileManagerFactory.getByProject(projectId);
    const { url } = await fileManager.getFileContent({
      fileId: actualItem.fileId,
    });
    store.setContext({
      fileId: {
        src: url,
      },
    });
  }

  render();
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;

  store.showFullImagePreview({ itemId });
  render();
};

export const handleImageItemClick = async (deps, payload) => {
  const { store, render, fileManagerFactory, router, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();

  const { p: projectId } = router.getPayload();
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { url } = await fileManager.getFileContent({
    fileId: selectedItem.fileId,
  });
  store.setContext({
    fileId: {
      src: url,
    },
  });
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const {
    router,
    store,
    render,
    fileManagerFactory,
    repositoryFactory,
    globalUI,
  } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  const characterId = store.selectCharacterId();
  const { characters } = repository.getState();
  const character = characters.items[characterId];

  if (!character) {
    globalUI.showAlert({ message: "Character not found", title: "Error" });
    return;
  }

  // Upload all files
  const uploadResults = await fileManager.upload(files);

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

export const handleFormChange = async (deps, payload) => {
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
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
    },
  });

  const { characters } = repository.getState();
  const character = characters.items[characterId];
  store.setItems(character?.sprites || { items: {}, tree: [] });
  render();
};

export const handleFormExtraEvent = async (deps) => {
  const {
    router,
    repositoryFactory,
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

  const uploadedFiles = await fileManager.upload([file]);

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

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { repositoryFactory, router, store, render } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  repository.addAction({
    actionType: "treeDelete",
    target: resourceType,
    value: {
      id: itemId,
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = repository.getState()[resourceType];
  store.setItems(data);
  render();
};
