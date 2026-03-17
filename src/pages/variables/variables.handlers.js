import { nanoid } from "nanoid";
import { createVariablesFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { tap } from "rxjs";

const EMPTY_TREE = { tree: [], items: {} };

const createVariableResourceData = ({
  name,
  scope = "global-device",
  type = "string",
  defaultValue = "",
} = {}) => ({
  name,
  scope,
  type,
  default: defaultValue,
  value: defaultValue,
});

const getVariablesData = ({ repositoryState } = {}) => {
  return repositoryState?.variables ?? EMPTY_TREE;
};

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId ?? detail.id ?? detail.item?.id ?? "";
};

const syncVariablesData = ({ store, repositoryState } = {}) => {
  store.setItems({
    variablesData: getVariablesData({ repositoryState }),
  });
};

export const handleBeforeMount = (deps) => {
  const { projectService, store, render } = deps;
  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => {
        syncVariablesData({ store, repositoryState });
        render();
      }),
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
};

const refreshVariablesData = async (deps) => {
  const { store, render, projectService } = deps;
  syncVariablesData({
    store,
    repositoryState: projectService.getState(),
  });
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

  await projectService.createVariable({
    variableId: nanoid(),
    data: createVariableResourceData({
      name,
      scope,
      type,
      defaultValue,
    }),
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

  await projectService.updateVariable({
    variableId: itemId,
    data: {
      name,
      scope,
      default: defaultValue,
      value: defaultValue,
    },
  });

  store.setSelectedItemId({ itemId });

  await refreshVariablesData(deps);
};

export const handleVariableDelete = async (deps, payload) => {
  const { store, projectService } = deps;
  const { itemId } = payload._event.detail;

  await projectService.deleteVariables({
    variableIds: [itemId],
  });

  if (store.selectSelectedItemId() === itemId) {
    store.setSelectedItemId({ itemId: undefined });
  }

  await refreshVariablesData(deps);
};
