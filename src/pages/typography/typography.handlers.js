import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { typography, colors, fonts } = repository.getState();
  store.setItems(typography);
  store.setColorsData(colors);
  store.setFontsData(fonts);

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { typography, colors, fonts } = repository.getState();
  store.setItems(typography);
  store.setColorsData(colors);
  store.setFontsData(fonts);
  render();
};

export const handleTypographyItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  // Create upload promises for all files
  const uploadPromises = Array.from(files).map(async (file) => {
    try {
      const { downloadUrl, uploadUrl, fileId } =
        await httpClient.creator.uploadFile({
          projectId: "someprojectId",
        });

      const response = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type, // Ensure the Content-Type matches the file type
        },
      });

      if (response.ok) {
        console.log("File uploaded successfully:", file.name);
        return {
          success: true,
          file,
          downloadUrl,
          fileId,
        };
      } else {
        console.error("File upload failed:", file.name, response.statusText);
        return {
          success: false,
          file,
          error: response.statusText,
        };
      }
    } catch (error) {
      console.error("File upload error:", file.name, error);
      return {
        success: false,
        file,
        error: error.message,
      };
    }
  });

  // Wait for all uploads to complete
  const uploadResults = await Promise.all(uploadPromises);

  // Add successfully uploaded files to repository
  const successfulUploads = uploadResults.filter((result) => result.success);

  successfulUploads.forEach((result) => {
    repository.addAction({
      actionType: "treePush",
      target: "typography",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "typography",
          fileId: result.fileId,
          name: result.file.name,
          fileType: result.file.type,
          fileSize: result.file.size,
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { typography } = repository.getState();
    store.setItems(typography);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleTypographyCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const {
    groupId,
    name,
    fontSize,
    lineHeight,
    fontColor,
    fontStyle,
    fontWeight,
    previewText,
  } = e.detail;

  repository.addAction({
    actionType: "treePush",
    target: "typography",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "typography",
        name: name,
        fontSize: fontSize,
        lineHeight: lineHeight,
        colorId: fontColor, // Store color ID
        fontId: fontStyle, // Store font ID
        fontWeight: fontWeight,
        previewText:
          previewText || "The quick brown fox jumps over the lazy dog",
      },
    },
  });

  const { typography } = repository.getState();
  store.setItems(typography);
  render();
};

export const handleTypographyUpdated = (e, deps) => {
  const { store, render, repository } = deps;
  const {
    itemId,
    name,
    fontSize,
    lineHeight,
    fontColor,
    fontStyle,
    fontWeight,
    previewText,
  } = e.detail;

  repository.addAction({
    actionType: "treeUpdate",
    target: "typography",
    value: {
      id: itemId,
      replace: false,
      item: {
        name: name,
        fontSize: fontSize,
        lineHeight: lineHeight,
        colorId: fontColor, // Store color ID
        fontId: fontStyle, // Store font ID
        fontWeight: fontWeight,
        previewText:
          previewText || "The quick brown fox jumps over the lazy dog",
      },
    },
  });

  const { typography } = repository.getState();
  store.setItems(typography);
  render();
};

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "typography",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { typography, colors, fonts } = repository.getState();
  store.setItems(typography);
  store.setColorsData(colors);
  store.setFontsData(fonts);
  render();
};

export const handleFormExtraEvent = (e, deps) => {
  const { store, render } = deps;

  // Handle typography preview click
  const selectedItemId = store.selectSelectedItemId();
  const flatItems = toFlatItems(store.getState().typographyData);
  const selectedItem = flatItems.find((item) => item.id === selectedItemId);

  if (selectedItem) {
    // Set form values from the selected item and open edit dialog
    store.setFormValuesFromItem(selectedItem);
    store.setEditMode(selectedItemId);
    store.toggleDialog();
    render();
  }
};

// Dialog handlers
export const handleAddTypographyClick = (e, deps) => {
  const { store, render } = deps;
  const { groupId } = e.detail;

  store.setTargetGroupId(groupId);
  store.clearEditMode();
  store.toggleDialog();
  render();
};

export const handleTypographyItemDoubleClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId, item } = e.detail;

  if (item) {
    // Set form values from the item
    store.setFormValuesFromItem(item);

    // Set edit mode and open dialog
    store.setEditMode(itemId);
    store.toggleDialog();
    render();
  }
};

export const handleDialogFormChange = (e, deps) => {
  const { store, render } = deps;

  // Update form values for preview
  store.updateFormValues(e.detail.formValues);
  render();
};

export const handleCloseDialog = (e, deps) => {
  const { store, render } = deps;

  // Reset form values, clear edit mode, and close dialog
  store.resetFormValues();
  store.clearEditMode();
  store.toggleDialog();
  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent, repository } = deps;

  // Check which button was clicked
  const actionId = e.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail
    const formData = e.detail.formValues;

    // Get the store state
    const storeState = store.getState
      ? store.getState()
      : store._state || store.state;
    const { targetGroupId, editMode, editingItemId } = storeState;

    // Validate required fields (dropdowns ensure valid color and font selections)
    if (
      !formData.name ||
      !formData.fontSize ||
      !formData.fontColor ||
      !formData.fontStyle ||
      !formData.fontWeight
    ) {
      alert("Please fill in all required fields");
      return;
    }

    // Validate font size is a number
    if (isNaN(formData.fontSize) || parseInt(formData.fontSize) <= 0) {
      alert("Please enter a valid font size (positive number)");
      return;
    }

    if (editMode && editingItemId) {
      // Handle typography update
      handleTypographyUpdated(
        {
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
        deps,
      );
    } else {
      // Handle typography creation
      handleTypographyCreated(
        {
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
        deps,
      );
    }

    // Reset form values, clear edit mode, and close dialog
    store.resetFormValues();
    store.clearEditMode();
    store.toggleDialog();
    render();
  }
};
