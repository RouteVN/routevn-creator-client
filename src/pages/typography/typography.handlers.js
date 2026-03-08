import { nanoid } from "nanoid";
import { toFlatItems } from "../../domain/treeHelpers.js";
import {
  getTypographyCount,
  getTypographyRemovalCount,
} from "../../constants/typography.js";
import { getFileType } from "../../utils/fileTypeUtils";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";
import { createResourceFileExplorerHandlers } from "../../deps/features/fileExplorerHandlers.js";

// Helper function to sync repository state to store
const syncRepositoryToStore = (store, projectService) => {
  const { typography, colors, fonts } = projectService.getState();
  store.setItems({ typographyData: typography });
  store.setColorsData({ colorsData: colors });
  store.setFontsData({ fontsData: fonts });
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  syncRepositoryToStore(store, projectService);
  render();
};

const refreshTypographyData = async (deps) => {
  const { store, render, projectService } = deps;
  syncRepositoryToStore(store, projectService);
  render();
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createResourceFileExplorerHandlers({
    resourceType: "typography",
    refresh: refreshTypographyData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshTypographyData;

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    render();
    return;
  }

  store.setSelectedItemId({ itemId: id });
  render();
};

export const handleTypographyItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;
  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.selectItem({ itemId });

  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Upload all files
  const uploadResults = await projectService.uploadFiles(files);

  // uploadResults already contains only successful uploads
  const successfulUploads = uploadResults;

  for (const result of successfulUploads) {
    await projectService.createResourceItem({
      resourceType: "typography",
      resourceId: nanoid(),
      data: {
        type: "typography",
        fileId: result.fileId,
        name: result.displayName,
        fileType: result.file.type,
        fileSize: result.file.size,
      },
      parentId: id,
      position: "last",
    });
  }

  if (successfulUploads.length > 0) {
    syncRepositoryToStore(store, projectService);
  }

  render();
};

const handleTypographyCreated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const {
    groupId,
    name,
    fontSize,
    lineHeight,
    fontColor,
    fontStyle,
    fontWeight,
    previewText,
  } = payload._event.detail;

  await projectService.createResourceItem({
    resourceType: "typography",
    resourceId: nanoid(),
    data: {
      type: "typography",
      name: name,
      fontSize: fontSize,
      lineHeight: lineHeight,
      colorId: fontColor,
      fontId: fontStyle,
      fontWeight: fontWeight,
      previewText: previewText,
    },
    parentId: groupId,
    position: "last",
  });

  syncRepositoryToStore(store, projectService);
  render();
};

const handleTypographyUpdated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const {
    itemId,
    name,
    fontSize,
    lineHeight,
    fontColor,
    fontStyle,
    fontWeight,
    previewText,
  } = payload._event.detail;

  await projectService.updateResourceItem({
    resourceType: "typography",
    resourceId: itemId,
    patch: {
      name: name,
      fontSize: fontSize,
      lineHeight: lineHeight,
      colorId: fontColor,
      fontId: fontStyle,
      fontWeight: fontWeight,
      previewText: previewText,
    },
  });

  syncRepositoryToStore(store, projectService);
  render();
};

export const handleFormExtraEvent = (deps) => {
  const { store, render } = deps;

  // Handle typography preview click
  const selectedItemId = store.selectSelectedItemId();
  const typographyData = store.selectTypographyData();
  const flatItems = toFlatItems(typographyData);
  const selectedItem = flatItems.find((item) => item.id === selectedItemId);

  if (selectedItem) {
    // Set form values from the selected item and open edit dialog
    store.setFormValuesFromItem({ item: selectedItem });
    store.setEditMode({ itemId: selectedItemId });
    store.toggleDialog();
    render();
  }
};

// Dialog handlers
export const handleAddTypographyClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;

  store.setTargetGroupId({ groupId: groupId });
  store.clearEditMode();
  store.resetFormValues(); // Reset form values for new typography
  store.toggleDialog();
  render();
};

export const handleTypographyItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  // Get the item from the store
  const item = store.selectItemById(itemId);

  if (item) {
    // Set form values from the item
    store.setFormValuesFromItem({ item: item });

    // Set edit mode and open dialog
    store.setEditMode({ itemId: itemId });
    store.toggleDialog();
    render();
  }
};

export const handleDialogFormChange = (deps, payload) => {
  const { store, render } = deps;

  // Update form values for preview
  store.updateFormValues({ formData: payload._event.detail.values });
  render();
};

export const handleCloseDialog = (deps) => {
  const { store, render } = deps;

  // Reset form values, clear edit mode, and close dialog
  store.resetFormValues();
  store.clearEditMode();
  store.toggleDialog();
  render();
};

export const handleFormActionClick = (deps, payload) => {
  const { store, render, appService } = deps;

  // Check which button was clicked
  const actionId = payload._event.detail.actionId;

  // Handle add option for color selector
  if (
    actionId === "select-options-add" &&
    payload._event.detail.name === "fontColor"
  ) {
    // Open the add color dialog
    store.openAddColorDialog();
    render();
    return;
  }

  // Handle add option for font selector
  if (
    actionId === "select-options-add" &&
    payload._event.detail.name === "fontStyle"
  ) {
    // Open the add font dialog
    store.openAddFontDialog();
    render();
    return;
  }

  if (actionId === "submit") {
    // Get form values from the event detail
    const formData = payload._event.detail.values;

    // Get the store state using selector
    const { targetGroupId, editMode, editingItemId } =
      store.selectDialogState();

    // Validate required fields (dropdowns ensure valid color and font selections)
    if (
      !formData.name ||
      !formData.fontSize ||
      !formData.fontColor ||
      !formData.fontStyle ||
      !formData.fontWeight
    ) {
      appService.showToast("Please fill in all required fields", {
        title: "Warning",
      });
      return;
    }

    // Validate font size is a number
    if (isNaN(formData.fontSize) || parseInt(formData.fontSize) <= 0) {
      appService.showToast("Please enter a valid font size (positive number)", {
        title: "Warning",
      });
      return;
    }

    if (editMode && editingItemId) {
      // Handle typography update
      handleTypographyUpdated(deps, {
        _event: {
          detail: {
            itemId: editingItemId,
            name: formData.name,
            fontSize: formData.fontSize,
            lineHeight: formData.lineHeight,
            fontColor: formData.fontColor,
            fontStyle: formData.fontStyle,
            fontWeight: formData.fontWeight,
            previewText: formData.previewText,
          },
        },
      });
    } else {
      // Handle typography creation
      handleTypographyCreated(deps, {
        _event: {
          detail: {
            groupId: targetGroupId,
            name: formData.name,
            fontSize: formData.fontSize,
            lineHeight: formData.lineHeight,
            fontColor: formData.fontColor,
            fontStyle: formData.fontStyle,
            fontWeight: formData.fontWeight,
            previewText: formData.previewText,
          },
        },
      });
    }

    // Reset form values, clear edit mode, and close dialog
    store.resetFormValues();
    store.clearEditMode();
    store.toggleDialog();
    render();
  }
};

// Add color dialog handlers
export const handleAddColorDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeAddColorDialog();
  render();
};

export const handleAddColorFormAction = async (deps, payload) => {
  const { store, render, projectService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.values;
    const newColorId = nanoid();

    // Create the color in the repository
    await projectService.createResourceItem({
      resourceType: "colors",
      resourceId: newColorId,
      data: {
        type: "color",
        name: formData.name,
        hex: formData.hex,
      },
      parentId: formData.folderId || null,
      position: "last",
    });

    // Sync repository to store to ensure all data is updated
    syncRepositoryToStore(store, projectService);

    // Don't update the form values - keep preview consistent with form state
    // The user can manually select the new color from the dropdown

    // Close the add color dialog
    store.closeAddColorDialog();
    render();
  }
};

// Add font dialog handlers
export const handleAddFontDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeAddFontDialog();
  render();
};

export const handleFontFileSelected = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { files } = payload._event.detail;

  if (files && files.length > 0) {
    const file = files[0];
    // Extract font name from file name (remove extension)
    const fontName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, "");

    try {
      // Upload the file immediately when selected
      const uploadResults = await projectService.uploadFiles([file]);

      if (uploadResults.length === 0) {
        appService.showToast("Failed to upload font file", { title: "Error" });
        return;
      }

      const uploadResult = uploadResults[0];
      store.setSelectedFontFile({
        file,
        fileName: fontName,
        uploadResult, // Store the upload result for later use
      });
      render();
    } catch (error) {
      console.error("Failed to upload font file:", error);
      appService.showToast("Failed to upload font file", { title: "Error" });
    }
  }
};

export const handleAddFontFormAction = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.values;
    const fontData = store.selectSelectedFontData();

    // Check if a font file was selected and uploaded
    if (!fontData || !fontData.uploadResult) {
      appService.showToast("Please select a font file", { title: "Warning" });
      return;
    }

    const fontName = fontData.fileName;
    const newFontId = nanoid();

    // Create the font in the repository using the already uploaded file
    await projectService.createResourceItem({
      resourceType: "fonts",
      resourceId: newFontId,
      data: {
        type: "font",
        name: fontName,
        fontFamily: fontName,
        fileId: fontData.uploadResult.fileId,
        fileName: fontData.file.name,
        fileType: getFileType(fontData.uploadResult),
        fileSize: fontData.file.size,
      },
      parentId: formData.folderId || null,
      position: "last",
    });

    // Sync repository to store to ensure all data is updated
    syncRepositoryToStore(store, projectService);

    // Clear selected font data and close dialog
    store.clearSelectedFontFile();
    store.closeAddFontDialog();
    render();
  }
};
export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value ?? "";
  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  const state = projectService.getState();

  if (resourceType === "typography") {
    const typographyCount = getTypographyCount(state.typography);
    const removalCount = getTypographyRemovalCount(state.typography, itemId);
    if (typographyCount - removalCount < 1) {
      appService.showToast("At least one typography must remain.");
      render();
      return;
    }
  }

  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["layouts"],
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
  store.setItems({ typographyData: data });
  render();
};
