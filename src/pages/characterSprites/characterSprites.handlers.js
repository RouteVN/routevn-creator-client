import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const callFormMethod = ({ formRef, methodName, payload } = {}) => {
  if (!formRef || !methodName) return false;

  if (typeof formRef[methodName] === "function") {
    formRef[methodName](payload);
    return true;
  }

  if (typeof formRef.transformedMethods?.[methodName] === "function") {
    formRef.transformedMethods[methodName](payload);
    return true;
  }

  return false;
};

const createDetailFormValues = (item, imageSrc) => {
  if (!item) {
    return {
      fileId: null,
      name: "",
      description: "",
    };
  }

  return {
    fileId: imageSrc || null,
    name: item.name || "",
    description: item.description || "No description provided",
  };
};

const syncDetailFormValues = ({
  deps,
  values,
  selectedItemId,
  attempt = 0,
} = {}) => {
  const formRef = deps?.refs?.detailForm;
  const currentSelectedItemId = deps?.store?.selectSelectedItemId?.();

  if (!selectedItemId || selectedItemId !== currentSelectedItemId) {
    return;
  }

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncDetailFormValues({
          deps,
          values,
          selectedItemId,
          attempt: attempt + 1,
        });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncDetailFormValues({
        deps,
        values,
        selectedItemId,
        attempt: attempt + 1,
      });
    }, 0);
  }
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
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  let imageSrc = null;

  if (selectedItem?.fileId) {
    const { url } = await projectService.getFileContent(selectedItem.fileId);
    imageSrc = url;
  }

  store.setContext({
    context: {
      fileId: {
        src: imageSrc,
      },
    },
  });
  const detailValues = createDetailFormValues(selectedItem, imageSrc);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const detail = payload?._event?.detail || {};
  const id = resolveDetailItemId(detail);
  const { item, isFolder } = detail;

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
      context: {
        fileId: {
          src: null,
        },
      },
    });
    render();
    return;
  }

  if (!id) {
    return;
  }

  store.setSelectedItemId({ itemId: id });
  const selectedItem = actualItem || store.selectSelectedItem();
  let imageSrc = null;

  // If we have item data with fileId, set up media context for preview
  if (selectedItem?.fileId) {
    const { url } = await projectService.getFileContent(selectedItem.fileId);
    imageSrc = url;
  }

  store.setContext({
    context: {
      fileId: {
        src: imageSrc,
      },
    },
  });

  const detailValues = createDetailFormValues(selectedItem, imageSrc);
  render();
  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: id,
    });
  }
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
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = detail.item || store.selectSelectedItem();
  let imageSrc = null;

  if (selectedItem?.fileId) {
    const { url } = await projectService.getFileContent(selectedItem.fileId);
    imageSrc = url;
  }

  store.setContext({
    context: {
      fileId: {
        src: imageSrc,
      },
    },
  });
  const detailValues = createDetailFormValues(selectedItem, imageSrc);
  render();
  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: itemId,
    });
  }
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService, globalUI } = deps;
  const repository = await projectService.getRepository();
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
      await repository.addEvent({
        type: "treePush",
        payload: {
          target: `characters.items.${characterId}.sprites`,
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
        },
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
  const repository = await projectService.getRepository();

  const characterId = store.selectCharacterId();
  const selectedItemId = store.selectSelectedItemId();

  await repository.addEvent({
    type: "treeUpdate",
    payload: {
      target: `characters.items.${characterId}.sprites`,
      value: {
        [payload._event.detail.name]: payload._event.detail.value,
      },
      options: {
        id: selectedItemId,
        replace: false,
      },
    },
  });

  const { characters } = projectService.getState();
  const character = characters.items[characterId];
  store.setItems({
    spritesData: character?.sprites || { items: {}, tree: [] },
  });
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(
    selectedItem,
    store.getState()?.context?.fileId?.src || null,
  );
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFormExtraEvent = async (deps) => {
  const { projectService, appService, store, render } = deps;
  const repository = await projectService.getRepository();

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
  const selectedItemId = store.selectSelectedItemId();

  await repository.addEvent({
    type: "treeUpdate",
    payload: {
      target: `characters.items.${characterId}.sprites`,
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
    },
  });

  // Update the store with the new repository state
  const { characters } = projectService.getState();
  const character = characters.items[characterId];
  store.setContext({
    context: {
      fileId: {
        src: uploadResult.downloadUrl,
      },
    },
  });
  store.setItems({
    spritesData: character?.sprites || { items: {}, tree: [] },
  });
  const updatedSelectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(
    updatedSelectedItem,
    uploadResult.downloadUrl,
  );
  render();

  if (updatedSelectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const repository = await projectService.getRepository();
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
  await repository.addEvent({
    type: "treeDelete",
    payload: {
      target: `characters.items.${characterId}.sprites`,
      options: {
        id: itemId,
      },
    },
  });

  // Refresh data and update store
  const { characters } = projectService.getState();
  const character = characters.items[characterId];
  store.setItems({
    spritesData: character?.sprites || { items: {}, tree: [] },
  });
  render();
};
