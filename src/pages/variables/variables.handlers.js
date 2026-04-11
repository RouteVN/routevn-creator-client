import { nanoid } from "nanoid";
import { createVariablesFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { tap } from "rxjs";

const EMPTY_TREE = { tree: [], items: {} };

const createVariableResourceData = ({
  name,
  description = "",
  scope = "device",
  type = "string",
  defaultValue = "",
} = {}) => ({
  name,
  description,
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

const {
  handleFileExplorerAction: handleVariablesFileExplorerAction,
  handleFileExplorerTargetChanged,
} = createVariablesFileExplorerHandlers({
  refresh: refreshVariablesData,
});

const openVariableEditDialog = ({ deps, itemId } = {}) => {
  const { refs, store, render } = deps;
  if (!itemId) {
    return;
  }

  refs.fileexplorer?.selectItem?.({ itemId });
  store.setSelectedItemId({ itemId });
  render();
  refs.groupview?.openEditDialog?.({ itemId });
};

export const handleFileExplorerAction = async (deps, payload) => {
  const detail = payload?._event?.detail ?? {};
  const action = (detail.item || detail)?.value;

  if (action === "edit-item") {
    openVariableEditDialog({
      deps,
      itemId: detail.itemId,
    });
    return;
  }

  await handleVariablesFileExplorerAction(deps, payload);
};

export { handleFileExplorerTargetChanged };

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
  const { store, render } = deps;
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

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  const itemId = store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  openVariableEditDialog({ deps, itemId });
};

export const handleVariableCreated = async (deps, payload) => {
  const { appService, projectService } = deps;
  const {
    groupId,
    name,
    description,
    scope,
    type,
    default: defaultValue,
  } = payload._event.detail;

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to create variable.",
    action: () =>
      projectService.createVariable({
        variableId: nanoid(),
        data: createVariableResourceData({
          name,
          description,
          scope,
          type,
          defaultValue,
        }),
        parentId: groupId,
        position: "last",
      }),
  });

  if (!createAttempt.ok) {
    return;
  }

  await refreshVariablesData(deps);
};

export const handleVariableUpdated = async (deps, payload) => {
  const { appService, store, projectService } = deps;
  const {
    itemId,
    name,
    description,
    scope,
    default: defaultValue,
  } = payload._event.detail;

  if (!itemId) {
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update variable.",
    action: () =>
      projectService.updateVariable({
        variableId: itemId,
        data: {
          name,
          description: description ?? "",
          scope,
          default: defaultValue,
          value: defaultValue,
        },
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

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
