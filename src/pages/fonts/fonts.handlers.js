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

const getFileType = (result) => {
  if (result.file.type) return result.file.type;

  // Check magic numbers from bytes for font formats
  if (result.arrayBuffer || result.buffer) {
    const bytes = new Uint8Array(result.arrayBuffer || result.buffer);

    // TTF: starts with 0x00010000 or "true" (0x74727565)
    if (bytes.length >= 4) {
      const magic =
        (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];

      // TTF signatures
      if (magic === 0x00010000 || magic === 0x74727565) {
        return "font/ttf";
      }

      // OTF: starts with "OTTO" (0x4F54544F)
      if (magic === 0x4f54544f) {
        return "font/otf";
      }

      // WOFF: starts with "wOFF" (0x774F4646)
      if (magic === 0x774f4646) {
        return "font/woff";
      }

      // WOFF2: starts with "wOF2" (0x774F4632)
      if (magic === 0x774f4632) {
        return "font/woff2";
      }

      // TTC: starts with "ttcf" (0x74746366)
      if (magic === 0x74746366) {
        return "font/ttc";
      }

      // EOT: starts with 0x02000100 or 0x01000200 (little endian)
      if (
        magic === 0x02000100 ||
        magic === 0x01000200 ||
        (bytes[0] === 0x00 &&
          bytes[1] === 0x01 &&
          bytes[2] === 0x00 &&
          bytes[3] === 0x02)
      ) {
        return "font/eot";
      }
    }
  }

  // Fallback to extension-based detection
  const ext = result.file.name.split(".").pop()?.toLowerCase();
  if (result.type === "font" && ext) {
    return `font/${ext}`;
  }
  throw new Error("Unknown file type");
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
