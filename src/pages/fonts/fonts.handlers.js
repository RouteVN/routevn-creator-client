import { nanoid } from "nanoid";

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

export const handleReplaceItem = async (e, deps) => {
  const { store, render, uploadFontFiles, repository } = deps;
  const { file } = e.detail;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem || !file) {
    return;
  }

  // Validate file format
  if (!file.name.match(/\.(ttf|otf|woff|woff2)$/i)) {
    alert(
      "Invalid file format. Please upload a font file (.ttf, .otf, .woff, or .woff2)",
    );
    return;
  }

  // Upload the font - this already loads it for preview
  const successfulUploads = await uploadFontFiles([file], "someprojectId");

  if (successfulUploads.length > 0) {
    const result = successfulUploads[0];

    repository.addAction({
      actionType: "treeUpdate",
      target: "fonts",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          fileId: result.fileId,
          name: file.name,
          fontFamily: result.fontName,
          fileType: file.type,
          fileSize: file.size,
        },
      },
    });

    // Update the store with the new repository state
    const { fonts } = repository.getState();
    store.setItems(fonts);
  }

  render();
};

export const handleFileAction = (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;

  if (detail.value === "rename-item-confirmed") {
    // Get the currently selected item
    const selectedItem = store.selectSelectedItem();
    if (!selectedItem) {
      return;
    }

    // Update the item name in the repository
    repository.addAction({
      actionType: "treeUpdate",
      target: "fonts",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          name: detail.newName,
        },
      },
    });

    // Update the store with the new repository state
    const { fonts } = repository.getState();
    store.setItems(fonts);
    render();
  }
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
    (file) => !file.name.match(/\.(ttf|otf|woff|woff2)$/i),
  );
  if (invalidFiles.length > 0) {
    alert(
      "Invalid file format. Please upload only font files (.ttf, .otf, .woff, or .woff2)",
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

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleDetailPanelItemUpdate = (e, deps) => {
  const { repository, store, render } = deps;

  repository.addAction({
    actionType: "treeUpdate",
    target: "fonts",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

  const { fonts } = repository.getState();
  store.setItems(fonts);
  render();
};
