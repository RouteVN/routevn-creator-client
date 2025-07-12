
import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { typography, colors, fonts } = repository.getState();
  store.setItems(typography);
  store.setColorsData(colors);
  store.setFontsData(fonts);

  return () => {}
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
  const { groupId, name, fontSize, fontColor, fontStyle, fontWeight, previewText } = e.detail;

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
        colorId: fontColor, // Store color ID
        fontId: fontStyle,  // Store font ID
        fontWeight: fontWeight,
        previewText: previewText || 'The quick brown fox jumps over the lazy dog',
      },
    },
  });

  const { typography } = repository.getState();
  store.setItems(typography);
  render();
};


export const handleFileAction = (e, deps) => {
  const { store, render, repository } = deps;
  const { value, newName } = e.detail;
  
  if (value === 'rename-item-confirmed') {
    // Get the currently selected item
    const selectedItem = store.selectSelectedItem();
    if (!selectedItem) {
      return;
    }
    
    // Update the typography item name
    repository.addAction({
      actionType: "treeUpdate",
      target: "typography",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          name: newName,
        },
      },
    });
    
    // Update the store with the new repository state
    const { typography } = repository.getState();
    store.setItems(typography);
    render();
  }
};

export const handleReplaceItem = (e, deps) => {
  const { store, render, repository } = deps;
  
  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }
  
  const { fontSize, fontColor, fontStyle, fontWeight, previewText } = e.detail;
  
  // Create update object with only the fields that are provided
  // This preserves existing values for fields that aren't being updated
  const updateItem = {};
  
  if (fontSize !== undefined && fontSize !== null && fontSize !== '') {
    // Validate font size is a number
    if (isNaN(fontSize) || parseInt(fontSize) <= 0) {
      alert('Please enter a valid font size (positive number)');
      return;
    }
    updateItem.fontSize = fontSize;
  }
  
  if (fontColor !== undefined && fontColor !== null && fontColor !== '') {
    updateItem.colorId = fontColor; // Store color ID
  }
  
  if (fontStyle !== undefined && fontStyle !== null && fontStyle !== '') {
    updateItem.fontId = fontStyle; // Store font ID
  }
  
  if (fontWeight !== undefined && fontWeight !== null && fontWeight !== '') {
    updateItem.fontWeight = fontWeight;
  }
  
  if (previewText !== undefined && previewText !== null) {
    updateItem.previewText = previewText || 'The quick brown fox jumps over the lazy dog';
  }
  
  // Only update if there are changes to make
  if (Object.keys(updateItem).length === 0) {
    return;
  }
  
  // Update the typography in the repository
  repository.addAction({
    actionType: "treeUpdate",
    target: "typography",
    value: {
      id: selectedItem.id,
      replace: false,
      item: updateItem,
    },
  });
  
  // Update the store with the new repository state
  const { typography } = repository.getState();
  store.setItems(typography);
  render();
};
