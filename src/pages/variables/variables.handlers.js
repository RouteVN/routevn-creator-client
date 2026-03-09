import { nanoid } from "nanoid";
import { createVariablesFileExplorerHandlers } from "../../deps/features/fileExplorerHandlers.js";

const EMPTY_TREE = { tree: [], items: {} };

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId ?? detail.id ?? detail.item?.id ?? "";
};

let cleanupProjectSubscription;

const syncVariablesData = ({ store, repositoryState, projectService } = {}) => {
  const state = repositoryState ?? projectService?.getState?.();
  store.setItems({
    variablesData: state?.variables ?? EMPTY_TREE,
  });
};

export const handleBeforeMount = () => {
  return () => {
    cleanupProjectSubscription?.();
    cleanupProjectSubscription = undefined;
  };
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  cleanupProjectSubscription?.();
  cleanupProjectSubscription = await projectService.subscribeProjectState(
    ({ repositoryState }) => {
      syncVariablesData({ store, repositoryState });
      render();
    },
  );
};

const refreshVariablesData = async (deps) => {
  const { store, render, projectService } = deps;
  syncVariablesData({ store, projectService });
  render();
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createVariablesFileExplorerHandlers({
    refresh: refreshVariablesData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshVariablesData;

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload?._event?.detail ?? {};
  const itemId = resolveDetailItemId(detail);
  const isFolder =
    detail.isFolder === true ||
    detail.item?.type === "folder" ||
    detail.itemType === "folder";

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    render();
    return;
  }

  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  render();
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const detail = payload?._event?.detail ?? {};
  const itemId = resolveDetailItemId(detail);
  const isFolder =
    detail.isFolder === true ||
    detail.item?.type === "folder" ||
    detail.itemType === "folder";

  if (isFolder || !itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  const { groupview } = refs;
  groupview.openEditDialog({ itemId });
  render();
};

export const handleVariableItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const detail = payload?._event?.detail ?? {};
  const itemId = resolveDetailItemId(detail);
  if (!itemId) {
    return;
  }

  const { fileexplorer } = refs;
  fileexplorer.selectItem({ itemId });
  store.setSelectedItemId({ itemId });
  render();
};

export const handleVariableCreated = async (deps, payload) => {
  const { projectService } = deps;
  const {
    groupId,
    name,
    scope,
    type,
    default: defaultValue,
  } = payload._event.detail;

  await projectService.createVariableItem({
    variableId: nanoid(),
    name,
    scope,
    type,
    defaultValue,
    parentId: groupId,
    position: "last",
  });

  await refreshVariablesData(deps);
};

export const handleVariableUpdated = async (deps, payload) => {
  const { store, projectService } = deps;
  const { itemId, name, scope, default: defaultValue } = payload._event.detail;

  if (!itemId) {
    return;
  }

  await projectService.updateVariableItem({
    variableId: itemId,
    patch: {
      name,
      scope,
      default: defaultValue,
    },
  });

  store.setSelectedItemId({ itemId });

  await refreshVariablesData(deps);
};

export const handleVariableDelete = async (deps, payload) => {
  const { store, projectService } = deps;
  const { itemId } = payload._event.detail;

  await projectService.deleteVariableItem({
    variableId: itemId,
  });

  if (store.selectSelectedItemId() === itemId) {
    store.setSelectedItemId({ itemId: undefined });
  }

  await refreshVariablesData(deps);
};
