import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

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
  store.setItems({ colorsData: colors });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { colors } = projectService.getState();
  store.setItems({ colorsData: colors });
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id, item, isFolder } = payload._event.detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    store.setContext({
      colorImage: {
        src: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId({ itemId: id });

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
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
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

  await projectService.createResourceItem({
    resourceType: "colors",
    resourceId: nanoid(),
    data: {
      type: "color",
      name,
      hex,
    },
    parentId: groupId,
    position: "last",
  });

  const { colors } = projectService.getState();
  store.setItems({ colorsData: colors });
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
  await projectService.updateResourceItem({
    resourceType: "colors",
    resourceId: store.selectSelectedItemId(),
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const { colors } = projectService.getState();
  store.setItems({ colorsData: colors });

  // Update context if hex value changed
  if (payload._event.detail.name === "hex") {
    store.setContext({
      colorImage: {
        src: hexToBase64Image(payload._event.detail.value),
      },
    });
  }

  render();
};

export const handleColorItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;
  store.openEditDialog({ itemId: itemId });
  render();
};

export const handleAddColorClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog({ groupId: groupId });
  render();
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.values;
    const editItemId = store.getState().editItemId;

    if (!formData.name || !formData.name.trim()) {
      appService.showToast("Color name is required.", { title: "Warning" });
      return;
    }
    // Update the color in the repository
    await projectService.updateResourceItem({
      resourceType: "colors",
      resourceId: editItemId,
      patch: {
        name: formData.name,
        hex: formData.hex,
      },
    });

    const { colors } = projectService.getState();
    store.setItems({ colorsData: colors });

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
      store.openEditDialog({ itemId: selectedItemId });
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
  const { store, render, projectService, appService } = deps;

  if (payload._event.detail.actionId === "submit") {
    const formData = payload._event.detail.values;

    if (!formData.name || !formData.name.trim()) {
      appService.showToast("Color name cannot be empty.", { title: "Warning" });
      return;
    }

    const targetGroupId = store.getState().targetGroupId;
    const newColorId = nanoid();

    // Create the color in the repository
    await projectService.createResourceItem({
      resourceType: "colors",
      resourceId: newColorId,
      data: {
        type: "color",
        name: formData.name,
        hex: formData.hex,
      },
      parentId: targetGroupId,
      position: "last",
    });

    const { colors } = projectService.getState();
    store.setItems({ colorsData: colors });
    store.closeAddDialog();
    render();
  }
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.toggleGroupCollapse({ groupId: groupId });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  const state = projectService.getState();
  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["typography"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteResourceItem({
    resourceType,
    resourceId: itemId,
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ colorsData: data });
  render();
};
