import { nanoid } from "nanoid";
import { createFontInfoExtractor } from "../../deps/fontInfoExtractor.js";
import { toFlatItems } from "insieme";
import { getFileType } from "../../utils/fileTypeUtils";
import { formatFileSize } from "../../utils/index.js";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const fontToBase64Image = (fontFamily, text = "Aa") => {
  if (!fontFamily) return "";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 200;
  canvas.height = 100;

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, 200, 100);

  ctx.fillStyle = "#ffffff";
  ctx.font = `48px "${fontFamily}", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 100, 50);

  return canvas.toDataURL("image/png");
};

const getFileTypeFromName = (fileName) => {
  if (!fileName) return "";
  const extension = fileName.toLowerCase().split(".").pop();
  const extensionMap = {
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
    ttc: "font/ttc",
    eot: "font/eot",
  };

  return extensionMap[extension] || `font/${extension}`;
};

const callFormMethod = ({ formRef, methodName, payload } = {}) => {
  if (!formRef || !methodName) return false;

  if (typeof formRef[methodName] === "function") {
    formRef[methodName](payload);
    return true;
  }

  if (typeof formRef.transformedMethods?.[methodName] === "function") {
    formRef.transformedMethods[methodName](payload);
    return true;
  }

  return false;
};

const syncDetailFormValues = ({
  deps,
  values,
  selectedItemId,
  attempt = 0,
} = {}) => {
  const formRef = deps?.refs?.detailForm;
  const currentSelectedItemId = deps?.store?.selectSelectedItemId?.();

  if (selectedItemId && selectedItemId !== currentSelectedItemId) {
    return;
  }

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncDetailFormValues({
          deps,
          values,
          selectedItemId,
          attempt: attempt + 1,
        });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncDetailFormValues({
        deps,
        values,
        selectedItemId,
        attempt: attempt + 1,
      });
    }, 0);
  }
};

const createDetailFormValues = (item) => {
  if (!item) {
    return {
      fontPreview: null,
      name: "",
      fontFamily: "",
      fileType: "",
      fileSize: "",
    };
  }

  const fontFamily = item.fontFamily || "";
  const fileType = item.fileType || getFileTypeFromName(item.name);
  const fileSize = item.fileSize ? formatFileSize(item.fileSize) : "";
  const fontPreview = fontToBase64Image(fontFamily, "Aa") || null;

  return {
    fontPreview,
    name: item.name || "",
    fontFamily,
    fileType,
    fileSize,
  };
};

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
  const { id, item, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    store.setContext({
      context: {
        fileId: {
          fontFamily: "",
        },
      },
    });
    render();
    return;
  }

  store.setSelectedItemId({ itemId: id });

  const selectedItem = item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  store.setContext({
    context: {
      fileId: {
        fontFamily: detailValues.fontFamily,
      },
    },
  });

  render();
  syncDetailFormValues({
    deps,
    values: detailValues,
    selectedItemId: id,
  });
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
  const detailValues = createDetailFormValues(selectedItem);
  store.setContext({
    context: {
      fileId: {
        fontFamily: detailValues.fontFamily,
      },
    },
  });

  render();
  syncDetailFormValues({
    deps,
    values: detailValues,
    selectedItemId: itemId,
  });
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
  await projectService.appendEvent({
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
  const { fonts } = projectService.getState();
  store.setContext({
    context: {
      fileId: {
        fontFamily: uploadResult.fontName,
      },
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

    await projectService.appendEvent({
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
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "fonts",
      value: {
        [payload._event.detail.name]: payload._event.detail.value,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
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
  await projectService.appendEvent({
    type: "treeDelete",
    payload: {
      target: resourceType,
      options: {
        id: itemId,
      },
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ fontsData: data });
  render();
};
