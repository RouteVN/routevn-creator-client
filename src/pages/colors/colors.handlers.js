import { nanoid } from "nanoid";
import { recursivelyCheckResource, TYPOGRAPHY_RESOURCE_KEYS } from "../../utils/resourceUsageChecker.js";

const hexToBase64Image = (hex) => {
  if (!hex) return "";

  // Create a canvas element
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Set canvas size
  canvas.width = 100;
  canvas.height = 100;

  // Fill with the color
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 100, 100);

  // Convert to base64
  return canvas.toDataURL("image/png");
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { colors } = projectService.getState();
  store.setItems(colors);
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { colors } = projectService.getState();
  store.setItems(colors);
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id, item, isFolder } = payload._event.detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId(null);
    store.setContext({
      colorImage: {
        src: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId(id);

  // If we have item data with hex value, set up color context for preview
  if (item && item.hex) {
    store.setContext({
      colorImage: {
        src: hexToBase64Image(item.hex),
      },
    });
  }

  render();
};

export const handleColorItemClick = (deps, payload) => {
  const { store, render, getRefIds } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();
  if (selectedItem && selectedItem.hex) {
    store.setContext({
      colorImage: {
        src: hexToBase64Image(selectedItem.hex),
      },
    });
  }
  render();
};

export const handleColorCreated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { groupId, name, hex } = payload._event.detail;

  await projectService.appendEvent({
    type: "treePush",
    payload: {
      target: "colors",
      value: {
        id: nanoid(),
        type: "color",
        name: name,
        hex: hex,
      },
      options: {
        parent: groupId,
        position: "last",
      },
    },
  });

  const { colors } = projectService.getState();
  store.setItems(colors);
  render();
};

export const handleColorEdited = (deps, payload) => {
  const { subject } = deps;
  const { itemId, name, hex } = payload._event.detail;

  // Dispatch to app handlers for repository update
  subject.dispatch("update-color", {
    itemId,
    updates: {
      name,
      hex,
    },
  });
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "colors",
      value: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const { colors } = projectService.getState();
  store.setItems(colors);

  // Update context if hex value changed
  if (payload._event.detail.name === "hex") {
    store.setContext({
      colorImage: {
        src: hexToBase64Image(payload._event.detail.fieldValue),
      },
    });
  }

  render();
};

export const handleColorItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;
  store.openEditDialog(itemId);
  render();
};

export const handleAddColorClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog(groupId);
  render();
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { store, render, projectService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.formValues;
    const editItemId = store.getState().editItemId;

    // Update the color in the repository
    await projectService.appendEvent({
      type: "treeUpdate",
      payload: {
        target: "colors",
        value: {
          name: formData.name,
          hex: formData.hex,
        },
        options: {
          id: editItemId,
          replace: false,
        },
      },
    });

    const { colors } = projectService.getState();
    store.setItems(colors);

    // Update context if this is the selected item
    if (editItemId === store.getState().selectedItemId) {
      store.setContext({
        colorImage: {
          src: hexToBase64Image(formData.hex),
        },
      });
    }

    store.closeEditDialog();
    render();
  }
};

export const handleFormFieldClick = (deps, payload) => {
  const { store, render } = deps;
  // Check if the clicked field is the color image
  if (payload._event.detail.name === "colorImage") {
    const selectedItemId = store.selectSelectedItemId();
    if (selectedItemId) {
      store.openEditDialog(selectedItemId);
      render();
    }
  }
};

export const handleAddDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeAddDialog();
  render();
};

export const handleAddFormAction = async (deps, payload) => {
  const { store, render, projectService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.formValues;
    const targetGroupId = store.getState().targetGroupId;
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
          parent: targetGroupId,
          position: "last",
        },
      },
    });

    const { colors } = projectService.getState();
    store.setItems(colors);
    store.closeAddDialog();
    render();
  }
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  const state = projectService.getState();
  const typographyUsages = recursivelyCheckResource(state.typography, itemId, TYPOGRAPHY_RESOURCE_KEYS);
  const usage = {
    inProps: { typography: typographyUsages },
    isUsed: typographyUsages.length > 0,
    count: typographyUsages.length,
  };

  if (usage.isUsed) {
    store.showDeleteWarning({ itemId, usage });
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
  store.setItems(data);
  render();
};
