import { nanoid } from "nanoid";
import { createFontInfoExtractor } from "../../deps/fontInfoExtractor.js";
import { toFlatItems } from "#domain-structure";
import { getFileType } from "../../utils/fileTypeUtils";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { fonts } = projectService.getState();
  store.setItems({ fontsData: fonts });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { fonts } = projectService.getState();
  store.setItems({ fontsData: fonts });
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id } = payload._event.detail;

  store.setSelectedItemId({ itemId: id });
  render();
};

export const handleFontItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
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
  const { appService, projectService, store, render } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for font replacement");
    return;
  }

  const files = await appService.pickFiles({
    accept: ".ttf,.otf,.woff,.woff2,.ttc",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  // Validate file format
  if (!file.name.match(/\.(ttf|otf|woff|woff2|ttc)$/i)) {
    appService.showToast(
      "Invalid file format. Please upload a font file (.ttf, .otf, .woff, .woff2, or .ttc)",
      { title: "Warning" },
    );
    return;
  }

  const uploadedFiles = await projectService.uploadFiles([file]);

  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  await projectService.updateResourceItem({
    resourceType: "fonts",
    resourceId: selectedItem.id,
    patch: {
      fileId: uploadResult.fileId,
      name: uploadResult.file.name,
      fontFamily: uploadResult.fontName,
      fileType: getFileType(uploadResult),
      fileSize: uploadResult.file.size,
    },
  });

  // Update the store with the new repository state
  const { fonts } = projectService.getState();
  store.setContext({
    fileId: {
      fontFamily: uploadResult.fontName,
    },
  });
  store.setItems({ fontsData: fonts });
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Validate all files first
  const invalidFiles = Array.from(files).filter(
    (file) => !file.name.match(/\.(ttf|otf|woff|woff2|ttc)$/i),
  );
  if (invalidFiles.length > 0) {
    appService.showToast(
      "Invalid file format. Please upload only font files (.ttf, .otf, .woff, .woff2, or .ttc)",
      { title: "Warning" },
    );
    return;
  }

  // Upload files
  const successfulUploads = await projectService.uploadFiles(files);

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

    await projectService.createResourceItem({
      resourceType: "fonts",
      resourceId: fontItem.id,
      data: fontItem,
      parentId: id,
      position: "last",
    });

    newFontItems.push(fontItem);
  }

  if (successfulUploads.length > 0) {
    const { fonts } = projectService.getState();
    store.setItems({ fontsData: fonts });

    // Load the newly uploaded fonts to ensure they're available
    const loadPromises = newFontItems.map((item) =>
      projectService.loadFontFile({
        fontName: item.fontFamily,
        fileId: item.fileId,
      }),
    );
    await Promise.all(loadPromises);
  }

  render();
};

export const handleFontItemDoubleClick = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  // Find the font item
  const { fonts } = projectService.getState();
  const flatItems = toFlatItems(fonts);
  const fontItem = flatItems.find((item) => item.id === itemId);

  if (!fontItem) {
    console.warn("Font item not found:", itemId);
    return;
  }

  // Extract font information
  const fontInfoExtractor = createFontInfoExtractor({
    getFileContent: (fileId) => projectService.getFileContent(fileId),
    loadFont: (fontName, fontUrl) => appService.loadFont(fontName, fontUrl),
  });
  const fontInfo = await fontInfoExtractor.extractFontInfo(fontItem);

  // Open modal with font info
  store.setSelectedFontInfo({ fontInfo: fontInfo });
  store.setModalOpen({ isOpen: true });
  render();
};

export const handleCloseModal = (deps) => {
  const { store, render } = deps;

  store.setModalOpen({ isOpen: false });
  store.setSelectedFontInfo({ fontInfo: null });
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.updateResourceItem({
    resourceType: "fonts",
    resourceId: store.selectSelectedItemId(),
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const { fonts } = projectService.getState();
  store.setItems({ fontsData: fonts });
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  const groupId = payload._event.detail.groupId;

  store.toggleGroupCollapse({ groupId: groupId });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  const state = projectService.getState();
  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["typography"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteResourceItem({
    resourceType,
    resourceId: itemId,
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ fontsData: data });
  render();
};
