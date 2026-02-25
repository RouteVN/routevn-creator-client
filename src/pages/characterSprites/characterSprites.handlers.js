import { nanoid } from "nanoid";
import {
  nodeDelete,
  nodeInsert,
  nodeUpdate,
} from "../../deps/infra/domainStructure/actions.js";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const applyCharacterSpritesPatch = async ({
  projectService,
  characterId,
  operation,
}) => {
  const { characters } = projectService.getState();
  const character = characters.items?.[characterId];
  if (!character) return;

  const working = {
    sprites: structuredClone(character.sprites || { items: {}, order: [] }),
  };
  const next = operation(working) || working;
  const nextSprites = structuredClone(next.sprites || working.sprites);

  await projectService.updateResourceItem({
    resourceType: "characters",
    resourceId: characterId,
    patch: {
      sprites: nextSprites,
    },
  });
};

export const handleAfterMount = async (deps) => {
  const { appService, store, projectService, render, globalUI } = deps;
  const { characterId } = appService.getPayload();
  await projectService.ensureRepository();
  const { characters } = projectService.getState();
  const character = characters.items[characterId];

  if (!character) {
    globalUI.showAlert({ message: "Character not found", title: "Error" });
  }

  store.setCharacterId({ characterId: characterId });
  store.setCharacterName({ characterName: character.name });
  store.setItems({ spritesData: character.sprites });
  render();
};

export const handleDataChanged = async (deps) => {
  const { appService, render, store, projectService, globalUI } = deps;
  const { characterId } = appService.getPayload();
  await projectService.ensureRepository();
  const { characters } = projectService.getState();
  const character = characters.items[characterId];

  if (!character) {
    globalUI.showAlert({ message: "Character not found", title: "Error" });
    return;
  }

  store.setCharacterName({ characterName: character.name });
  store.setItems({ spritesData: character.sprites });
  render();
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { id, item, isFolder } = payload._event.detail;

  // For characterSprites, get item data from our own store since BaseFileExplorer
  // can't access the nested character.sprites data structure
  let actualItem = item;
  if (!actualItem) {
    // Get the item from our store's spritesData
    const flatItems = store.selectFlatItems();
    actualItem = flatItems.find((item) => item.id === id) || null;
  }

  // Check if this is a folder (either from BaseFileExplorer or from our own data)
  const actualIsFolder =
    isFolder || (actualItem && actualItem.type === "folder");

  // If this is a folder, clear selection and context
  if (actualIsFolder) {
    store.setSelectedItemId({ itemId: null });
    store.setContext({
      fileId: {
        src: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId({ itemId: id });

  // If we have item data with fileId, set up media context for preview
  if (actualItem && actualItem.fileId) {
    const { url } = await projectService.getFileContent(actualItem.fileId);
    store.setContext({
      fileId: {
        src: url,
      },
    });
  }

  render();
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  store.showFullImagePreview({ itemId });
  render();
};

export const handleImageItemClick = async (deps, payload) => {
  const { store, render, projectService, refs } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();

  const { url } = await projectService.getFileContent(selectedItem.fileId);
  store.setContext({
    fileId: {
      src: url,
    },
  });
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService, globalUI } = deps;
  const { files, targetGroupId } = payload._event.detail; // Extract from forwarded event
  const id = targetGroupId;

  const characterId = store.selectCharacterId();
  const { characters } = projectService.getState();
  const character = characters.items[characterId];

  if (!character) {
    globalUI.showAlert({ message: "Character not found", title: "Error" });
    return;
  }

  // Upload all files
  const uploadResults = await projectService.uploadFiles(files);

  // uploadResults already contains only successful uploads
  const successfulUploads = uploadResults;

  if (successfulUploads.length > 0) {
    for (const result of successfulUploads) {
      await applyCharacterSpritesPatch({
        projectService,
        characterId,
        operation: (state) =>
          nodeInsert(state, {
            target: "sprites",
            value: {
              id: nanoid(),
              type: "image",
              fileId: result.fileId,
              name: result.displayName,
              fileType: result.file.type,
              fileSize: result.file.size,
              width: result.dimensions.width,
              height: result.dimensions.height,
            },
            options: {
              parent: id,
              position: "last",
            },
          }),
      });
    }

    // Update store with the latest repository state
    const { characters } = projectService.getState();
    const character = characters.items[characterId];
    store.setItems({ spritesData: character.sprites });
  }

  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;

  const characterId = store.selectCharacterId();
  const selectedItemId = store.selectSelectedItemId();

  await applyCharacterSpritesPatch({
    projectService,
    characterId,
    operation: (state) =>
      nodeUpdate(state, {
        target: "sprites",
        value: {
          [payload._event.detail.name]: payload._event.detail.value,
        },
        options: {
          id: selectedItemId,
          replace: false,
        },
      }),
  });

  const { characters } = projectService.getState();
  const character = characters.items[characterId];
  store.setItems({
    spritesData: character?.sprites || { items: {}, order: [] },
  });
  render();
};

export const handleFormExtraEvent = async (deps) => {
  const { projectService, appService, store, render } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    console.warn("No item selected for image replacement");
    return;
  }

  const files = await appService.pickFiles({
    accept: "image/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const uploadedFiles = await projectService.uploadFiles(files);

  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  const characterId = store.selectCharacterId();

  await applyCharacterSpritesPatch({
    projectService,
    characterId,
    operation: (state) =>
      nodeUpdate(state, {
        target: "sprites",
        value: {
          fileId: uploadResult.fileId,
          name: uploadResult.file.name,
          fileType: uploadResult.file.type,
          fileSize: uploadResult.file.size,
          width: uploadResult.dimensions.width,
          height: uploadResult.dimensions.height,
        },
        options: {
          id: selectedItem.id,
          replace: false,
        },
      }),
  });

  // Update the store with the new repository state
  const { characters } = projectService.getState();
  const character = characters.items[characterId];
  store.setContext({
    fileId: {
      src: uploadResult.downloadUrl,
    },
  });
  store.setItems({
    spritesData: character?.sprites || { items: {}, order: [] },
  });
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { itemId } = payload._event.detail;

  const characterId = store.selectCharacterId();
  const state = projectService.getState();

  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await applyCharacterSpritesPatch({
    projectService,
    characterId,
    operation: (state) =>
      nodeDelete(state, {
        target: "sprites",
        options: {
          id: itemId,
        },
      }),
  });

  // Refresh data and update store
  const { characters } = projectService.getState();
  const character = characters.items[characterId];
  store.setItems({
    spritesData: character?.sprites || { items: {}, order: [] },
  });
  render();
};
