import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const getColorItemById = ({ store, itemId } = {}) => {
  if (!itemId) return undefined;
  const item = store.getState().colorsData?.items?.[itemId];
  if (!item || item.type !== "color") return undefined;
  return item;
};

const syncEditFormValues = ({ deps, values } = {}) => {
  const formRef = deps?.refs?.editForm;
  if (!formRef) {
    return;
  }
  formRef.reset();
  formRef.setValues({ values });
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) return;

  const { store, render } = deps;
  const colorItem = getColorItemById({ store, itemId });
  if (!colorItem) return;

  store.setSelectedItemId({ itemId: itemId });
  store.openEditDialog({ itemId: itemId });
  render();

  syncEditFormValues({
    deps,
    values: {
      name: colorItem.name ?? "",
      hex: colorItem.hex ?? "",
    },
  });
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
  const { id, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    render();
    return;
  }

  store.setSelectedItemId({ itemId: id });
  render();
};

export const handleColorItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;
  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.selectItem({ itemId });

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

export const handleColorItemDoubleClick = (deps, payload) => {
  const { store } = deps;
  const detail = payload?._event?.detail || {};
  const isFolder = detail.isFolder === true;

  if (isFolder) return;

  const candidateIds = [detail.itemId, detail.id, store.selectSelectedItemId()];
  const itemId = candidateIds.find((candidateId) =>
    getColorItemById({ store, itemId: candidateId }),
  );
  if (!itemId) return;

  openEditDialogWithValues({ deps, itemId: itemId });
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

    store.closeEditDialog();
    render();
  }
};

export const handleFormFieldClick = (deps) => {
  const { store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (selectedItemId) {
    openEditDialogWithValues({ deps, itemId: selectedItemId });
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
  const searchQuery = payload._event.detail?.value ?? "";
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
