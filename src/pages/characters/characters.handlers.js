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
  const { store, render, getFileContent } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const selectedItem = store.selectSelectedItem();

  if (selectedItem && selectedItem.fileId) {
    const { url } = await getFileContent({
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

export const handleCharacterCreated = async (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name, description, avatarFileId } = e.detail;

  try {
    let characterData = {
      id: nanoid(),
      type: "character",
      name: name,
      description: description,
      sprites: {
        items: {},
        tree: [],
      },
    };

    // If avatar fileId is provided, add it to character data
    if (avatarFileId) {
      characterData.fileId = avatarFileId;
    }

    // Add character to repository
    repository.addAction({
      actionType: "treePush",
      target: "characters",
      value: {
        parent: groupId,
        position: "last",
        item: characterData,
      },
    });

    // Update store with new data
    const { characters } = repository.getState();
    store.setItems(characters);
    render();
  } catch (error) {
    console.error("Failed to create character:", error);

    throw error;
  }
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
  const { repository, store, render, filePicker, uploadImageFiles, getFileContent } = deps;

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
    // Upload the new avatar file using uploadImageFiles
    const uploadedFiles = await uploadImageFiles([file], "someprojectId");

    if (uploadedFiles && uploadedFiles.length > 0) {
      const uploadedFile = uploadedFiles[0];
      console.log("Character avatar uploaded successfully:", file.name);

      const updateData = {
        fileId: uploadedFile.fileId,
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

      // Update the store with the new repository state and get new file URL
      const { characters } = repository.getState();
      
      // Get the new file URL
      const { url } = await getFileContent({
        fileId: uploadedFile.fileId,
        projectId: "someprojectId",
      });
      
      store.setContext({
        fileId: {
          src: url,
        },
      });
      store.setItems(characters);
      render();
    } else {
      console.error("Avatar upload failed:", file.name);
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
