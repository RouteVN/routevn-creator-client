import { nanoid } from "nanoid";
import { createFontInfoExtractor } from "../../deps/fontInfoExtractor.js";
import { toFlatItems } from "../../deps/repository.js";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { fonts } = repository.getState();
  store.setItems(fonts);
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { fonts } = repository.getState();
  store.setItems(fonts);
  render();
};

export const handleFontItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleFormExtraEvent = async (e, deps) => {
  const { repository, store, render, filePicker, uploadFontFiles } = deps;

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
    alert(
      "Invalid file format. Please upload a font file (.ttf, .otf, .woff, .woff2, or .ttc)",
    );
    return;
  }

  const uploadedFiles = await uploadFontFiles([file], "someprojectId");

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
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
      },
    },
  });

  // Update the store with the new repository state
  const { fonts } = repository.getState();
  store.setFieldResources({
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
    uploadFontFiles,
    repository,
    httpClient,
    fontManager,
    loadFontFile,
  } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Validate all files first
  const invalidFiles = Array.from(files).filter(
    (file) => !file.name.match(/\.(ttf|otf|woff|woff2|ttc)$/i),
  );
  if (invalidFiles.length > 0) {
    alert(
      "Invalid file format. Please upload only font files (.ttf, .otf, .woff, .woff2, or .ttc)",
    );
    return;
  }

  // Upload files
  const successfulUploads = await uploadFontFiles(files, "someprojectId");

  // Add successfully uploaded files to repository and collect new font items
  const newFontItems = [];
  successfulUploads.forEach((result) => {
    const fontItem = {
      id: nanoid(),
      type: "font",
      fileId: result.fileId,
      name: result.file.name,
      fontFamily: result.fontName,
      fileType: result.file.type,
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
    const loadPromises = newFontItems.map((item) => loadFontFile(item));
    await Promise.all(loadPromises);
  }

  render();
};

export const handleFontItemDoubleClick = async (e, deps) => {
  const { store, render, repository, httpClient, fontManager } = deps;
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
    httpClient,
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

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
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
