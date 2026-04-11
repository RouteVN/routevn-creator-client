import { createAnimationEditorPayload } from "../../internal/animationEditorRoute.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";

const navigateToAnimationEditor = ({
  appService,
  animationId,
  dialogType,
  targetGroupId,
  name,
  description,
} = {}) => {
  const currentPayload = appService.getPayload() || {};
  appService.navigate("/project/animation-editor", {
    ...createAnimationEditorPayload({
      payload: currentPayload,
      animationId,
      dialogType,
      targetGroupId,
      name,
      description,
    }),
  });
};

const {
  handleBeforeMount: handleBeforeMountBase,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction: handleFileExplorerActionBase,
  handleFileExplorerTargetChanged,
  handleItemClick: handleAnimationItemClick,
  handleSearchInput,
} = createCatalogPageHandlers({
  resourceType: "animations",
});

export {
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerTargetChanged,
  handleAnimationItemClick,
  handleSearchInput,
};

export const handleBeforeMount = (deps) => {
  return handleBeforeMountBase(deps);
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const { refs, render, store } = deps;
  const { editForm, fileExplorer } = refs;
  const item = store.selectAnimationItemById({ itemId });
  if (!item) {
    return;
  }

  const editValues = {
    name: item.name ?? "",
    description: item.description ?? "",
  };

  store.setSelectedItemId({ itemId });
  fileExplorer.selectItem({ itemId });
  store.openEditDialog({
    itemId,
    defaultValues: editValues,
  });
  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
};

const openAnimationEditor = ({ appService, store, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const itemData = store.selectAnimationDisplayItemById({ itemId });
  if (!itemData) {
    return;
  }

  navigateToAnimationEditor({
    appService,
    animationId: itemId,
  });
};

export const handleFileExplorerAction = async (deps, payload) => {
  const detail = payload?._event?.detail ?? {};
  const action = (detail.item || detail)?.value;

  if (action === "edit-item") {
    openEditDialogWithValues({
      deps,
      itemId: detail.itemId,
    });
    return;
  }

  await handleFileExplorerActionBase(deps, payload);
};

export const handleAddAnimationClick = async (deps, payload) => {
  const { render, store } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog({ groupId });
  render();
};

export const handleAnimationItemDoubleClick = (deps, payload) => {
  const { appService, store } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }

  openAnimationEditor({
    appService,
    store,
    itemId,
  });
};

export const handleAnimationItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;

  openEditDialogWithValues({ deps, itemId });
};

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  openEditDialogWithValues({
    deps,
    itemId: store.selectSelectedItemId(),
  });
};

export const handleEditDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Please enter an animation name.", {
      title: "Warning",
    });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update animation.",
    action: () =>
      projectService.updateAnimation({
        animationId: editItemId,
        data: {
          name,
          description: values?.description ?? "",
        },
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
  await handleDataChanged(deps, { selectedItemId: editItemId });
};

export const handleAddDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeAddDialog();
  render();
};

export const handleAddFormAction = async (deps, payload) => {
  const { appService, render, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Please enter an animation name.", {
      title: "Warning",
    });
    return;
  }

  const dialogType =
    values?.dialogType === "transition" ? "transition" : "update";
  const targetGroupId = store.selectTargetGroupId();

  store.closeAddDialog();
  render();

  navigateToAnimationEditor({
    appService,
    targetGroupId,
    dialogType,
    name,
    description: values?.description ?? "",
  });
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const usage = recursivelyCheckResource({
    state: projectService.getState(),
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    return;
  }

  await projectService.deleteAnimations({
    animationIds: [itemId],
  });

  await handleDataChanged(deps);
};

export const handleItemDuplicate = async (deps, payload) => {
  const { appService, projectService } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const duplicateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to duplicate animation.",
    action: () =>
      projectService.duplicateAnimation({
        animationId: itemId,
      }),
  });
  if (!duplicateAttempt.ok) {
    return;
  }

  await handleDataChanged(deps, {
    selectedItemId: duplicateAttempt.result,
  });
};
