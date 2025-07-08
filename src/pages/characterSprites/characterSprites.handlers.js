
import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
  const { router, store, repository } = deps;
  const { characterId } = router.getPayload();
  const { characters } = repository.getState();
  const character = characters.items[characterId];
  
  if (!character) {
    alert("Character not found");
    return () => {};
  }
  
  store.setCharacterId(characterId);
  store.setItems(character.sprites);
  return () => {}
};


export const handleDataChanged = (e, deps) => {
  const { router, render, store, repository } = deps;
  const { characterId } = router.getPayload();
  const { characters } = repository.getState();
  const character = characters.items[characterId];
  
  if (!character) {
    alert("Character not found");
    return;
  }
  
  store.setItems(character.sprites);
  render();
};


export const handleImageItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleDragDropFileSelected = async (e, deps) => {
  const { store, render, httpClient, repository } = deps;
  const { files, targetGroupId } = e.detail; // Extract from forwarded event
  const id = targetGroupId;

  const characterId = store.selectCharacterId();
  const { characters } = repository.getState();
  const character = characters.items[characterId];
  
  if (!character) {
    alert("Character not found");
    return;
  }

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

  if (successfulUploads.length > 0) {
    successfulUploads.forEach((result) => {
      repository.addAction({
        actionType: "treePush",
        target: `characters.items.${characterId}.sprites`,
        value: {
          parent: id,
          position: "last",
          item: {
            id: nanoid(),
            type: "image",
            fileId: result.fileId,
            name: result.file.name,
            fileType: result.file.type,
            fileSize: result.file.size,
          },
        },
      });
    });
    
    // Update store with the latest repository state
    const { characters } = repository.getState();
    const character = characters.items[characterId];
    store.setItems(character.sprites);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleFileAction = (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;
  
  if (detail.value === 'rename-item-confirmed') {
    // Get the currently selected item
    const selectedItem = store.selectSelectedItem();
    if (!selectedItem) {
      console.warn('No item selected for rename');
      return;
    }
    
    // Update the item name in the repository
    repository.addAction({
      actionType: "treeUpdate",
      target: "characterSprites",
      value: {
        id: selectedItem.id,
        replace: false,
        item: {
          name: detail.newName,
        },
      },
    });
    
    // Update the store with the new repository state
    const { characters } = repository.getState();
    const character = characters.items[store.selectCharacterId()];
    store.setItems(character.sprites);
    render();
  }
};
