import { generateId } from "../../internal/id.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";

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
      description: colorItem.description ?? "",
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
  const { store, render, refs } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  store.setSelectedItemId({ itemId });
  refs.fileExplorer?.selectItem?.({ itemId });
  store.openPreviewDialog();
  render();
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

export const handlePreviewDialogClose = (deps) => {
  const { store, render } = deps;
  store.closePreviewDialog();
  render();
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

export const handleEditFormAction = async (deps, payload) => {
  const { store, projectService, appService, render } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Color name is required.",
      title: "Warning",
    });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update color.",
    action: () =>
      projectService.updateColor({
        colorId: editItemId,
        data: {
          name,
          hex: values?.hex ?? "#ffffff",
          description: values?.description ?? "",
        },
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

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
    appService.showAlert({
      message: "Color name cannot be empty.",
      title: "Warning",
    });
    return;
  }

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to create color.",
    action: () =>
      projectService.createColor({
        colorId: generateId(),
        data: {
          type: "color",
          name,
          description: values?.description ?? "",
          hex: values?.hex ?? "#ffffff",
        },
        parentId: store.getState().targetGroupId,
        position: "last",
      }),
  });
  if (!createAttempt.ok) {
    return;
  }

  store.closeAddDialog();
  await handleDataChanged(deps);
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;

  const usage = recursivelyCheckResource({
    state: projectService.getState(),
    itemId,
    checkTargets: ["textStyles"],
  });

  if (usage.isUsed) {
    appService.showAlert({
      message: "Cannot delete resource, it is currently in use.",
    });
    render();
    return;
  }

  await projectService.deleteColors({
    colorIds: [itemId],
  });

  await handleDataChanged(deps);
};
