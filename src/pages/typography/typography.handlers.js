import { nanoid } from "nanoid";
import { toFlatItems } from "#insieme-compat";
import {
  getTypographyCount,
  getTypographyRemovalCount,
} from "../../constants/typography.js";
import { getFileType } from "../../utils/fileTypeUtils";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

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

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  syncRepositoryToStore(store, projectService);
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id, item, isFolder } = payload._event.detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    store.setContext({
      typographyPreview: {
        src: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId({ itemId: id });

  if (item) {
    try {
      const colorsData = store.selectColorsData();
      const fontsData = store.selectFontsData();

      const previewImage = generateTypographyPreview(
        item,
        colorsData,
        fontsData,
      );

      store.setContext({
        typographyPreview: {
          src: previewImage,
        },
      });
    } catch (error) {
      console.error("Failed to generate typography preview:", error);
      store.setContext({
        typographyPreview: {
          src: null,
        },
      });
    }
  }

  render();
};

// Helper function to generate typography preview image
const generateTypographyPreview = (item, colorsData, fontsData) => {
  if (!item) {
    throw new Error("Typography item is required");
  }

  // Create canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 300;
  canvas.height = 120;

  // Background
  const backgroundColor = "#1a1a1a";
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, 300, 120);

  // Resolve color
  if (!item.colorId) {
    throw new Error("colorId is required");
  }
  if (!colorsData) {
    throw new Error("Color data not available to resolve colorId");
  }
  const colorItems = toFlatItems(colorsData);
  const color = colorItems.find(
    (c) => c.type === "color" && c.id === item.colorId,
  );
  if (!color || !color.hex) {
    throw new Error(
      `Color with ID ${item.colorId} not found or has no hex value`,
    );
  }
  const textColor = color.hex;

  // Resolve font
  if (!item.fontId) {
    throw new Error("fontId is required");
  }
  if (!fontsData) {
    throw new Error("Font data not available to resolve fontId");
  }
  const fontItems = toFlatItems(fontsData);
  const font = fontItems.find((f) => f.type === "font" && f.id === item.fontId);
  if (!font || !font.fontFamily) {
    throw new Error(
      `Font with ID ${item.fontId} not found or has no fontFamily`,
    );
  }
  const fontFamily = font.fontFamily;

  // Validate required properties
  if (!item.fontSize) {
    throw new Error("fontSize is required");
  }
  if (!item.fontWeight) {
    throw new Error("fontWeight is required");
  }
  if (!item.lineHeight) {
    throw new Error("lineHeight is required");
  }
  if (!item.previewText) {
    throw new Error("previewText is required");
  }

  // Set font properties
  ctx.fillStyle = textColor;
  ctx.font = `${item.fontWeight} ${item.fontSize}px "${fontFamily}", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // Draw text with word wrapping
  const maxWidth = 280;
  const x = 10;
  let y = 10;
  const words = item.previewText.split(" ");
  let line = "";
  const lineHeightPx = item.fontSize * item.lineHeight;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeightPx;

      if (y + lineHeightPx > 110) break;
    } else {
      line = testLine;
    }
  }

  if (line.length > 0 && y + lineHeightPx <= 110) {
    ctx.fillText(line, x, y);
  }

  return canvas.toDataURL("image/png");
};

export const handleTypographyItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;
  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();
  if (selectedItem) {
    try {
      // Use selectors instead of getState
      const colorsData = store.selectColorsData();
      const fontsData = store.selectFontsData();

      const previewImage = generateTypographyPreview(
        selectedItem,
        colorsData,
        fontsData,
      );

      store.setContext({
        typographyPreview: {
          src: previewImage,
        },
      });
    } catch (error) {
      console.error("Failed to generate typography preview:", error);
      store.setContext({
        typographyPreview: {
          src: null,
        },
      });
    }
  }

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
    await projectService.appendEvent({
      type: "treePush",
      payload: {
        target: "typography",
        value: {
          id: nanoid(),
          type: "typography",
          fileId: result.fileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
        },
        options: {
          parent: id,
          position: "last",
        },
      },
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

  await projectService.appendEvent({
    type: "treePush",
    payload: {
      target: "typography",
      value: {
        id: nanoid(),
        type: "typography",
        name: name,
        fontSize: fontSize,
        lineHeight: lineHeight,
        colorId: fontColor, // Store color ID
        fontId: fontStyle, // Store font ID
        fontWeight: fontWeight,
        previewText: previewText,
      },
      options: {
        parent: groupId,
        position: "last",
      },
    },
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

  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "typography",
      value: {
        name: name,
        fontSize: fontSize,
        lineHeight: lineHeight,
        colorId: fontColor, // Store color ID
        fontId: fontStyle, // Store font ID
        fontWeight: fontWeight,
        previewText: previewText,
      },
      options: {
        id: itemId,
        replace: false,
      },
    },
  });

  syncRepositoryToStore(store, projectService);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "typography",
      value: {
        [payload._event.detail.name]: payload._event.detail.value,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  syncRepositoryToStore(store, projectService);

  // Update context with new preview after form change
  const selectedItem = store.selectSelectedItem();
  if (selectedItem) {
    try {
      // Use selectors instead of getState
      const colorsData = store.selectColorsData();
      const fontsData = store.selectFontsData();

      const previewImage = generateTypographyPreview(
        selectedItem,
        colorsData,
        fontsData,
      );

      store.setContext({
        typographyPreview: {
          src: previewImage,
        },
      });
    } catch (error) {
      console.error("Failed to update typography preview:", error);
      store.setContext({
        typographyPreview: {
          src: null,
        },
      });
    }
  }

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
    await projectService.appendEvent({
      type: "treePush",
      payload: {
        target: "colors",
        value: {
          id: newColorId,
          type: "color",
          name: formData.name,
          hex: formData.hex,
        },
        options: {
          parent: formData.folderId || "_root",
          position: "last",
        },
      },
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
    await projectService.appendEvent({
      type: "treePush",
      payload: {
        target: "fonts",
        value: {
          id: newFontId,
          type: "font",
          name: fontName,
          fontFamily: fontName,
          fileId: fontData.uploadResult.fileId,
          fileName: fontData.file.name,
          fileType: getFileType(fontData.uploadResult),
          fileSize: fontData.file.size,
        },
        options: {
          parent: formData.folderId || "_root",
          position: "last",
        },
      },
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
  const searchQuery = payload._event.detail?.value || "";
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
  store.setItems({ typographyData: data });
  render();
};
