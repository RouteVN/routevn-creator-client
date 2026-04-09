import { createAnimationEditorPayload } from "../../internal/animationEditorRoute.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";

const navigateToAnimationEditor = ({
  appService,
  animationId,
  dialogType,
  targetGroupId,
} = {}) => {
  const currentPayload = appService.getPayload() || {};
  appService.navigate("/project/animation-editor", {
    ...createAnimationEditorPayload({
      payload: currentPayload,
      animationId,
      dialogType,
      targetGroupId,
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
  const { appService, store } = deps;
  const detail = payload?._event?.detail ?? {};
  const action = (detail.item || detail)?.value;

  if (action === "edit-item") {
    openAnimationEditor({
      appService,
      store,
      itemId: detail.itemId,
    });
    return;
  }

  await handleFileExplorerActionBase(deps, payload);
};

export const handleAddAnimationClick = async (deps, payload) => {
  const { render, store } = deps;
  const { groupId, x, y } = payload._event.detail;

  store.openCreateTypeMenu({
    x,
    y,
    targetGroupId: groupId,
  });
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
  const { appService, store } = deps;
  const { itemId } = payload._event.detail;

  openAnimationEditor({
    appService,
    store,
    itemId,
  });
};

export const handleDetailHeaderClick = async (deps) => {
  const { appService, store } = deps;
  const itemId = store.selectSelectedItemId();
  openAnimationEditor({
    appService,
    store,
    itemId,
  });
};

export const handleCloseCreateTypeMenu = (deps) => {
  const { render, store } = deps;
  store.closeCreateTypeMenu();
  render();
};

export const handleCreateTypeMenuItemClick = async (deps, payload) => {
  const { appService, render, store } = deps;
  const type = payload._event.detail.item?.value;
  const targetGroupId = store.selectCreateTypeMenuTargetGroupId();

  store.closeCreateTypeMenu();
  render();

  if (type !== "update" && type !== "transition") {
    return;
  }

  navigateToAnimationEditor({
    appService,
    targetGroupId,
    dialogType: type,
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
