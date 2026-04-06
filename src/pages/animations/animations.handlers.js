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
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleItemClick: handleAnimationItemClick,
  handleSearchInput,
} = createCatalogPageHandlers({
  resourceType: "animations",
});

export {
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleAnimationItemClick,
  handleSearchInput,
};

export const handleBeforeMount = (deps) => {
  return handleBeforeMountBase(deps);
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
  const { appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }

  const itemData = deps.store.selectAnimationDisplayItemById({ itemId });
  if (!itemData) {
    return;
  }

  navigateToAnimationEditor({
    appService,
    animationId: itemId,
  });
};

export const handleDetailHeaderClick = async (deps) => {
  const { appService, store } = deps;
  const itemId = store.selectSelectedItemId();
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
