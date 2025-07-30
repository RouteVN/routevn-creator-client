import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { characters } = repository.getState();
  store.setItems(characters);

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { characters } = repository.getState();
  store.setItems(characters);
  render();
};

export const handleCharacterItemClick = async (e, deps) => {
  const { store, render, httpClient } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();

  if (selectedItem && selectedItem.fileId) {
    const { url } = await httpClient.creator.getFileContent({
      fileId: selectedItem.fileId,
      projectId: "someprojectId",
    });
    store.setContext({
      fileId: {
        src: url,
      },
    });
  }
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
      target: "characters",
      value: {
        parent: id,
        position: "last",
        item: {
          id: nanoid(),
          type: "character",
          fileId: result.fileId,
          name: result.file.name,
          fileType: result.file.type,
          fileSize: result.file.size,
          sprites: {
            items: {},
            tree: [],
          },
        },
      },
    });
  });

  if (successfulUploads.length > 0) {
    const { characters } = repository.getState();
    store.setItems(characters);
  }

  console.log(
    `Uploaded ${successfulUploads.length} out of ${files.length} files successfully`,
  );
  render();
};

export const handleCharacterCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name, description } = e.detail;

  // Add character to repository
  repository.addAction({
    actionType: "treePush",
    target: "characters",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "character",
        name: name,
        description: description,
        sprites: {
          items: {},
          tree: [],
        },
        // No fileId for now - this will be a text-based character
      },
    },
  });

  // Update store with new data
  const { characters } = repository.getState();
  store.setItems(characters);
  render();
};

export const handleSpritesButtonClick = (e, deps) => {
  const { subject, render } = deps;
  const { itemId } = e.detail;

  // Dispatch redirect with path and payload for query params
  subject.dispatch("redirect", {
    path: "/project/resources/character-sprites",
    payload: {
      characterId: itemId,
    },
  });

  render();
};

export const handleFormExtraEvent = async (e, deps) => {
  const { repository, store, render, filePicker, httpClient } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for image replacement");
    return;
  }

  const files = await filePicker.open({
    accept: "image/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  try {
    // Upload the new avatar file
    const { downloadUrl, uploadUrl, fileId } =
      await httpClient.creator.uploadFile({
        projectId: "someprojectId",
      });

    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    if (response.ok) {
      console.log("Character avatar uploaded successfully:", file.name);

      const updateData = {
        fileId: fileId,
        fileType: file.type,
        fileSize: file.size,
        // Update name only if character doesn't have one or if it's the generic filename
        ...((!selectedItem.name ||
          selectedItem.name === "Untitled Character") && {
          name: file.name.replace(/\.[^/.]+$/, ""),
        }),
      };

      // Update the selected character in the repository with the new avatar
      repository.addAction({
        actionType: "treeUpdate",
        target: "characters",
        value: {
          id: selectedItem.id,
          replace: false,
          item: updateData,
        },
      });

      // Update the store with the new repository state
      const { characters } = repository.getState();
      store.setContext({
        fileId: {
          src: downloadUrl,
        },
      });
      store.setItems(characters);
      render();
    } else {
      console.error("Avatar upload failed:", file.name, response.statusText);
    }
  } catch (error) {
    console.error("Avatar upload error:", file.name, error);
  }
};

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "characters",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { characters } = repository.getState();
  store.setItems(characters);
  render();
};
