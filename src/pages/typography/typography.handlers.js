
import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { typography } = repository.getState();
  store.setItems(typography);

  return () => {}
};


export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { typography } = repository.getState();
  store.setItems(typography);
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
  const { groupId, name, fontSize, fontColor, fontStyle, fontWeight } = e.detail;

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
        fontColor: fontColor,
        fontStyle: fontStyle,
        fontWeight: fontWeight,
      },
    },
  });

  const { typography } = repository.getState();
  store.setItems(typography);
  render();
};

export const handleDetailFormActionClick = (e, deps) => {
  const { store, render, repository } = deps;
  
  // Handle rename form submission from detail panel
  const actionId = e.detail.actionId;
  
  if (actionId === 'submit') {
    const formData = e.detail.formValues;
    const selectedItem = store.selectSelectedItem();
    
    if (selectedItem && formData.name) {
      // Update the typography item name
      repository.addAction({
        actionType: "treeUpdate",
        target: "typography",
        value: {
          id: selectedItem.id,
          replace: false,
          item: {
            name: formData.name,
          },
        },
      });

      const { typography } = repository.getState();
      store.setItems(typography);
      render();
    }
  }
};

export const handleTypographyUpdated = (e, deps) => {
  const { store, render, repository } = deps;
  
  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }
  
  const { name, fontSize, fontColor, fontStyle, fontWeight } = e.detail;
  
  // Validate required fields
  if (!name || !fontSize || !fontColor || !fontStyle || !fontWeight) {
    alert('Please fill in all required fields');
    return;
  }
  
  // Get repository data for validation
  const { fonts, colors } = repository.getState();
  
  // Check if color exists
  const colorExists = toFlatItems(colors)
    .filter(item => item.type === 'color')
    .some(color => color.name === fontColor);
  
  if (!colorExists) {
    alert(`Color "${fontColor}" not found. Please use an existing color name.`);
    return;
  }
  
  // Check if font exists  
  const fontExists = toFlatItems(fonts)
    .filter(item => item.type === 'font')
    .some(font => font.fontFamily === fontStyle);
  
  if (!fontExists) {
    alert(`Font "${fontStyle}" not found. Please use an existing font family name.`);
    return;
  }
  
  // Validate font size is a number
  if (isNaN(fontSize) || parseInt(fontSize) <= 0) {
    alert('Please enter a valid font size (positive number)');
    return;
  }
  
  // Update the typography in the repository
  repository.addAction({
    actionType: "treeUpdate",
    target: "typography",
    value: {
      id: selectedItem.id,
      replace: false,
      item: {
        name: name,
        fontSize: fontSize,
        fontColor: fontColor,
        fontStyle: fontStyle,
        fontWeight: fontWeight,
      },
    },
  });
  
  // Update the store with the new repository state
  const { typography } = repository.getState();
  store.setItems(typography);
  render();
};
