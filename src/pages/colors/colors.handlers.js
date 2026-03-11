import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../internal/projectResources.js";
import { createCatalogPageHandlers } from "../../deps/features/resourcePages/catalog/createCatalogPageHandlers.js";

const syncEditFormValues = ({ deps, values } = {}) => {
  const { editForm } = deps.refs;
  editForm.reset();
  editForm.setValues({ values });
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const { store, render, refs } = deps;
  const colorItem = store.selectColorItemById({ itemId });
  if (!colorItem) {
    return;
  }

  store.setSelectedItemId({ itemId });
  refs.fileExplorer.selectItem({ itemId });
  store.openEditDialog({ itemId });
  render();

  syncEditFormValues({
    deps,
    values: {
      name: colorItem.name ?? "",
      hex: colorItem.hex ?? "",
    },
  });
};

const {
  handleBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleItemClick: handleColorItemClick,
  handleSearchInput,
} = createCatalogPageHandlers({
  resourceType: "colors",
});

export {
  handleBeforeMount,
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleColorItemClick,
  handleSearchInput,
};

export const handleColorItemDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openEditDialogWithValues({ deps, itemId });
};

export const handleAddColorClick = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog({ groupId });
  render();
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { store, projectService, appService, render } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Color name is required.", { title: "Warning" });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  await projectService.updateResourceItem({
    resourceType: "colors",
    resourceId: editItemId,
    patch: {
      name,
      hex: values?.hex ?? "#ffffff",
    },
  });

  store.closeEditDialog();
  await handleDataChanged(deps);
};

export const handleFormFieldClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

export const handleAddDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeAddDialog();
  render();
};

export const handleAddFormAction = async (deps, payload) => {
  const { store, projectService, appService } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Color name cannot be empty.", { title: "Warning" });
    return;
  }

  await projectService.createResourceItem({
    resourceType: "colors",
    resourceId: nanoid(),
    data: {
      type: "color",
      name,
      hex: values?.hex ?? "#ffffff",
    },
    parentId: store.getState().targetGroupId,
    position: "last",
  });

  store.closeAddDialog();
  await handleDataChanged(deps);
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;

  const usage = recursivelyCheckResource({
    state: projectService.getState(),
    itemId,
    checkTargets: ["typography"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  await projectService.deleteResourceItem({
    resourceType: "colors",
    resourceId: itemId,
  });

  await handleDataChanged(deps);
};
