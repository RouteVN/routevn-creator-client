import { nanoid } from "nanoid";
import { toFlatItems } from "../../internal/project/tree.js";
import {
  getTextStyleCount,
  getTextStyleRemovalCount,
} from "../../constants/textStyles.js";
import { getFileType } from "../../internal/fileTypes.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { tap } from "rxjs";

// Helper function to sync repository state to store
const syncRepositoryToStore = ({
  store,
  repositoryState,
  projectService,
} = {}) => {
  const state = repositoryState ?? projectService?.getState?.();
  store.setItems({ textStylesData: state?.textStyles });
  store.setColorsData({ colorsData: state?.colors });
  store.setFontsData({ fontsData: state?.fonts });
};

export const handleBeforeMount = (deps) => {
  const { projectService, store, render } = deps;
  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => {
        syncRepositoryToStore({ store, repositoryState });
        render();
      }),
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
};

const refreshTextStylesData = async (deps) => {
  const { store, render, projectService } = deps;
  syncRepositoryToStore({ store, projectService });
  render();
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createResourceFileExplorerHandlers({
    resourceType: "textStyles",
    refresh: refreshTextStylesData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshTextStylesData;

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    render();
    return;
  }

  store.setSelectedItemId({ itemId });
  render();
};

export const handleTextStyleItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;
  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.selectItem({ itemId });

  render();
};

const buildTextStyleData = ({
  name,
  fontSize,
  lineHeight,
  fontColor,
  fontStyle,
  fontWeight,
  previewText,
} = {}) => ({
  name,
  fontSize: Number(fontSize ?? 16),
  lineHeight: Number(lineHeight ?? 1.5),
  colorId: fontColor,
  fontId: fontStyle,
  fontWeight: String(fontWeight ?? "400"),
  previewText: previewText ?? "",
});

const handleTextStyleCreated = async (deps, payload) => {
  const { appService, projectService } = deps;
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

  const createResult = await projectService.createTextStyle({
    textStyleId: nanoid(),
    data: {
      type: "textStyle",
      ...buildTextStyleData({
        name,
        fontSize,
        lineHeight,
        fontColor,
        fontStyle,
        fontWeight,
        previewText,
      }),
    },
    parentId: groupId,
    position: "last",
  });

  if (createResult?.valid === false) {
    console.error("Failed to create text style:", createResult.error);
    appService.showToast("Failed to create text style.", {
      title: "Error",
    });
    return createResult;
  }

  await refreshTextStylesData(deps);
  return createResult;
};

const handleTextStyleUpdated = async (deps, payload) => {
  const { appService, projectService } = deps;
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

  const updateResult = await projectService.updateTextStyle({
    textStyleId: itemId,
    data: buildTextStyleData({
      name,
      fontSize,
      lineHeight,
      fontColor,
      fontStyle,
      fontWeight,
      previewText,
    }),
  });

  if (updateResult?.valid === false) {
    console.error("Failed to update text style:", updateResult.error);
    appService.showToast("Failed to update text style.", {
      title: "Error",
    });
    return updateResult;
  }

  await refreshTextStylesData(deps);
  return updateResult;
};

export const handleFormExtraEvent = (deps) => {
  const { store, render } = deps;

  // Handle text style preview click
  const selectedItemId = store.selectSelectedItemId();
  const textStylesData = store.selectTextStylesData();
  const flatItems = toFlatItems(textStylesData);
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
export const handleAddTextStyleClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;

  store.setTargetGroupId({ groupId: groupId });
  store.clearEditMode();
  store.resetFormValues(); // Reset form values for a new text style
  store.toggleDialog();
  render();
};

export const handleTextStyleItemDoubleClick = (deps, payload) => {
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

export const handleFormActionClick = async (deps, payload) => {
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

    let submitResult;

    if (editMode && editingItemId) {
      // Handle text style update
      submitResult = await handleTextStyleUpdated(deps, {
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
      // Handle text style creation
      submitResult = await handleTextStyleCreated(deps, {
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

    if (submitResult?.valid === false) {
      return;
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
    await projectService.createColor({
      colorId: newColorId,
      data: {
        type: "color",
        name: formData.name,
        hex: formData.hex,
      },
      parentId: formData.folderId || null,
      position: "last",
    });

    // Sync repository to store to ensure all data is updated
    syncRepositoryToStore({ store, projectService });

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
    await projectService.createFont({
      fontId: newFontId,
      data: {
        type: "font",
        name: fontName,
        fontFamily: fontName,
        fileId: fontData.uploadResult.fileId,
        fileType: getFileType(fontData.uploadResult),
        fileSize: fontData.file.size,
      },
      parentId: formData.folderId || null,
      position: "last",
    });

    // Sync repository to store to ensure all data is updated
    syncRepositoryToStore({ store, projectService });

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
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;

  const state = projectService.getState();

  const textStyleCount = getTextStyleCount(state.textStyles);
  const removalCount = getTextStyleRemovalCount(state.textStyles, itemId);
  if (textStyleCount - removalCount < 1) {
    appService.showToast("At least one text style must remain.");
    render();
    return;
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
  await projectService.deleteTextStyles({
    textStyleIds: [itemId],
  });

  await refreshTextStylesData(deps);
};
