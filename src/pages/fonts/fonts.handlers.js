import { nanoid } from "nanoid";
import { createFontInfoExtractor } from "../../deps/fontInfoExtractor.js";
import { toFlatItems } from "../../deps/repository.js";
import { getFileType } from "../../utils/getFileType";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { fonts } = repository.getState();
  store.setItems(fonts);
  render();
};

export const handleDataChanged = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { fonts } = repository.getState();
  store.setItems(fonts);
  render();
};

export const handleFontItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

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

export const handleFormExtraEvent = async (_, deps) => {
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
      type: "warning",
    });
    return;
  }

  const uploadedFiles = await fileManager.upload([file]);

  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  repository.addAction({
    actionType: "treeUpdate",
    target: "fonts",
    value: {
      id: selectedItem.id,
      replace: false,
      item: {
        fileId: uploadResult.fileId,
        name: uploadResult.file.name,
        fontFamily: uploadResult.fontName,
        fileType: getFileType(uploadResult),
        fileSize: uploadResult.file.size,
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

export const handleDragDropFileSelected = async (e, deps) => {
  const {
    store,
    render,
    fileManagerFactory,
    repositoryFactory,
    router,
    httpClient,
    fontManager,
    loadFontFile,
    globalUI,
  } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Validate all files first
  const invalidFiles = Array.from(files).filter(
    (file) => !file.name.match(/\.(ttf|otf|woff|woff2|ttc)$/i),
  );
  if (invalidFiles.length > 0) {
    globalUI.showAlert({
      message:
        "Invalid file format. Please upload only font files (.ttf, .otf, .woff, .woff2, or .ttc)",
      type: "warning",
    });
    return;
  }

  // Upload files
  const successfulUploads = await fileManager.upload(files);

  // Add successfully uploaded files to repository and collect new font items
  const newFontItems = [];
  successfulUploads.forEach((result) => {
    const fontItem = {
      id: nanoid(),
      type: "font",
      fileId: result.fileId,
      name: result.displayName,
      fontFamily: result.fontName,
      fileType: getFileType(result),
      fileSize: result.file.size,
    };

    repository.addAction({
      actionType: "treePush",
      target: "fonts",
      value: {
        parent: id,
        position: "last",
        item: fontItem,
      },
    });

    newFontItems.push(fontItem);
  });

  if (successfulUploads.length > 0) {
    const { fonts } = repository.getState();
    store.setItems(fonts);

    // Load the newly uploaded fonts to ensure they're available
    const loadPromises = newFontItems.map((item) =>
      loadFontFile({
        fontName: item.fontFamily,
        fileId: item.fileId,
        projectId: projectId,
      }),
    );
    await Promise.all(loadPromises);
  }

  render();
};

export const handleFontItemDoubleClick = async (e, deps) => {
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
  const { itemId } = e.detail;

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

export const handleCloseModal = (e, deps) => {
  const { store, render } = deps;

  store.setModalOpen(false);
  store.setSelectedFontInfo(null);
  render();
};

export const handleFormChange = async (e, deps) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "fonts",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { fonts } = repository.getState();
  store.setItems(fonts);
  render();
};
