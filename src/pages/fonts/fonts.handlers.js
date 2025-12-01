import { nanoid } from "nanoid";
import { createFontInfoExtractor } from "../../deps/fontInfoExtractor.js";
import { toFlatItems } from "insieme";
import { getFileType } from "../../utils/fileTypeUtils";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { fonts } = repository.getState();
  store.setItems(fonts);
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { fonts } = repository.getState();
  store.setItems(fonts);
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id } = payload._event.detail;

  store.setSelectedItemId(id);
  render();
};

export const handleFontItemClick = (deps, payload) => {
  const { store, render, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();
  if (selectedItem) {
    store.setContext({
      fileId: {
        fontFamily: selectedItem.fontFamily || "",
      },
    });
  }
  render();
};

export const handleFormExtraEvent = async (deps) => {
  const {
    repositoryFactory,
    router,
    store,
    render,
    filePicker,
    fileManagerFactory,
    globalUI,
  } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for font replacement");
    return;
  }

  const files = await filePicker.open({
    accept: ".ttf,.otf,.woff,.woff2,.ttc",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  // Validate file format
  if (!file.name.match(/\.(ttf|otf|woff|woff2|ttc)$/i)) {
    globalUI.showAlert({
      message:
        "Invalid file format. Please upload a font file (.ttf, .otf, .woff, .woff2, or .ttc)",
      title: "Warning",
    });
    return;
  }

  const uploadedFiles = await fileManager.upload([file]);

  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  await repository.addEvent({
    type: "treeUpdate",
    payload: {
      target: "fonts",
      value: {
        fileId: uploadResult.fileId,
        name: uploadResult.file.name,
        fontFamily: uploadResult.fontName,
        fileType: getFileType(uploadResult),
        fileSize: uploadResult.file.size,
      },
      options: {
        id: selectedItem.id,
        replace: false,
      },
    },
  });

  // Update the store with the new repository state
  const { fonts } = repository.getState();
  store.setContext({
    fileId: {
      fontFamily: uploadResult.fontName,
    },
  });
  store.setItems(fonts);
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const {
    store,
    render,
    fileManagerFactory,
    repositoryFactory,
    router,
    globalUI,
  } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Validate all files first
  const invalidFiles = Array.from(files).filter(
    (file) => !file.name.match(/\.(ttf|otf|woff|woff2|ttc)$/i),
  );
  if (invalidFiles.length > 0) {
    globalUI.showAlert({
      message:
        "Invalid file format. Please upload only font files (.ttf, .otf, .woff, .woff2, or .ttc)",
      title: "Warning",
    });
    return;
  }

  // Upload files
  const successfulUploads = await fileManager.upload(files);

  // Add successfully uploaded files to repository and collect new font items
  const newFontItems = [];
  for (const result of successfulUploads) {
    const fontItem = {
      id: nanoid(),
      type: "font",
      fileId: result.fileId,
      name: result.displayName,
      fontFamily: result.fontName,
      fileType: getFileType(result),
      fileSize: result.file.size,
    };

    await repository.addEvent({
      type: "treePush",
      payload: {
        target: "fonts",
        value: fontItem,
        options: {
          parent: id,
          position: "last",
        },
      },
    });

    newFontItems.push(fontItem);
  }

  if (successfulUploads.length > 0) {
    const { fonts } = repository.getState();
    store.setItems(fonts);

    // Load the newly uploaded fonts to ensure they're available
    const loadPromises = newFontItems.map((item) =>
      fileManager.loadFontFile({
        fontName: item.fontFamily,
        fileId: item.fileId,
      }),
    );
    await Promise.all(loadPromises);
  }

  render();
};

export const handleFontItemDoubleClick = async (deps, payload) => {
  const {
    store,
    render,
    repositoryFactory,
    router,
    fileManagerFactory,
    fontManager,
  } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  // Find the font item
  const { fonts } = repository.getState();
  const flatItems = toFlatItems(fonts);
  const fontItem = flatItems.find((item) => item.id === itemId);

  if (!fontItem) {
    console.warn("Font item not found:", itemId);
    return;
  }

  // Extract font information
  const fontInfoExtractor = createFontInfoExtractor({
    getFileContent: fileManager.getFileContent,
    fontManager,
  });
  const fontInfo = await fontInfoExtractor.extractFontInfo(fontItem);

  // Open modal with font info
  store.setSelectedFontInfo(fontInfo);
  store.setModalOpen(true);
  render();
};

export const handleCloseModal = (deps) => {
  const { store, render } = deps;

  store.setModalOpen(false);
  store.setSelectedFontInfo(null);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  await repository.addEvent({
    type: "treeUpdate",
    payload: {
      target: "fonts",
      value: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const { fonts } = repository.getState();
  store.setItems(fonts);
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  const groupId = payload._event.detail.groupId;

  store.toggleGroupCollapse(groupId);
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { repositoryFactory, router, store, render } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  await repository.addEvent({
    type: "treeDelete",
    payload: {
      target: resourceType,
      options: {
        id: itemId,
      },
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = repository.getState()[resourceType];
  store.setItems(data);
  render();
};
