import { generateId } from "../../internal/id.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { createVariablesFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { normalizeVariableEnumValues } from "../../internal/variableEnums.js";
import { createResourcePageTagHandlers } from "../../internal/ui/resourcePages/tags.js";
import {
  closeMobileResourceFileExplorerAfterSelection,
  handleMobileResourceDetailSheetClose,
  handleMobileResourceFileExplorerClose,
  handleMobileResourceFileExplorerOpen,
  syncMobileResourcePageUiConfig,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { VARIABLE_TAG_SCOPE_KEY } from "./variables.store.js";
import { tap } from "rxjs";

const EMPTY_TREE = { tree: [], items: {} };

const normalizeOptionalTagIds = (tagIds) => {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    return undefined;
  }

  return tagIds;
};

const createVariableResourceData = ({
  name,
  description = "",
  scope = "device",
  type = "string",
  defaultValue = "",
  isEnum = false,
  enumValues = [],
  tagIds,
} = {}) => {
  const enumEnabled = type === "string" && isEnum === true;
  const data = {
    name,
    description,
    scope,
    type,
    default: defaultValue,
    value: defaultValue,
  };
  const normalizedTagIds = normalizeOptionalTagIds(tagIds);

  if (type === "string") {
    data.isEnum = enumEnabled;
    data.enumValues = enumEnabled
      ? normalizeVariableEnumValues(enumValues)
      : [];
  }

  if (normalizedTagIds !== undefined) {
    data.tagIds = normalizedTagIds;
  }

  return data;
};

const getVariablesData = ({ repositoryState } = {}) => {
  const tagsData = getTagsCollection(repositoryState, VARIABLE_TAG_SCOPE_KEY);

  return {
    tagsData,
    variablesData: resolveCollectionWithTags({
      collection: repositoryState?.variables ?? EMPTY_TREE,
      tagsCollection: tagsData,
      itemType: "variable",
    }),
  };
};

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId ?? detail.id ?? detail.item?.id ?? "";
};

const syncVariablesData = ({ store, repositoryState } = {}) => {
  const { tagsData, variablesData } = getVariablesData({ repositoryState });
  store.setTagsData({ tagsData });
  store.setItems({
    variablesData,
  });
};

export const handleBeforeMount = (deps) => {
  const { projectService, store, render } = deps;
  syncMobileResourcePageUiConfig(deps);
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

export const handleAfterMount = (deps) => {
  focusFileExplorerKeyboardScope(deps);
};

const refreshVariablesData = async (deps, { selectedItemId } = {}) => {
  const { store, render, projectService, refs } = deps;
  syncVariablesData({
    store,
    repositoryState: projectService.getState(),
  });
  if (selectedItemId !== undefined) {
    const item = store.getState().variablesData?.items?.[selectedItemId];
    if (item?.type === "folder") {
      store.setSelectedFolderId({ folderId: selectedItemId });
    } else {
      store.setSelectedFolderId({ folderId: undefined });
      store.setSelectedItemId({ itemId: item ? selectedItemId : undefined });
    }
  }
  render();

  if (selectedItemId) {
    refs?.fileexplorer?.selectItem?.({ itemId: selectedItemId });
  }
};

const {
  handleFileExplorerAction: handleVariablesFileExplorerAction,
  handleFileExplorerTargetChanged,
} = createVariablesFileExplorerHandlers({
  refresh: refreshVariablesData,
});
const {
  focusKeyboardScope: focusFileExplorerKeyboardScope,
  handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  fileExplorerRefName: "fileexplorer",
});

const {
  openCreateTagDialogForMode,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
} = createResourcePageTagHandlers({
  resolveScopeKey: () => VARIABLE_TAG_SCOPE_KEY,
  updateItemTagIds: ({ deps, itemId, tagIds }) =>
    deps.projectService.updateVariable({
      variableId: itemId,
      data: {
        tagIds,
      },
    }),
  refreshAfterItemTagUpdate: ({ deps }) => refreshVariablesData(deps),
  getSelectedItemTagIds: ({ deps }) =>
    deps.store.selectSelectedItem()?.tagIds ?? [],
  appendCreatedTagByMode: ({ deps, mode, tagId }) => {
    if (mode !== "form") {
      return;
    }

    deps.refs.groupview?.appendTagIdToForm?.({ tagId });
  },
  updateItemTagFallbackMessage: "Failed to update variable tags.",
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

const openFolderNameDialogWithValues = ({ deps, folderId } = {}) => {
  const { refs, render, store } = deps;
  if (!folderId) {
    return;
  }

  const folder = store.selectFolderById({ folderId });
  if (!folder) {
    return;
  }

  const values = {
    name: folder.name ?? "",
  };

  store.setSelectedFolderId({ folderId });
  refs.fileexplorer?.selectItem?.({ itemId: folderId });
  store.openFolderNameDialog({
    folderId,
    defaultValues: values,
  });
  render();
  refs.folderNameForm?.reset?.();
  refs.folderNameForm?.setValues?.({ values });
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

export {
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleMobileResourceFileExplorerOpen as handleMobileFileExplorerOpen,
  handleMobileResourceFileExplorerClose as handleMobileFileExplorerClose,
  handleMobileResourceDetailSheetClose as handleMobileDetailSheetClose,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
};

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
    store.setSelectedFolderId({ folderId: itemId });
    render();
    focusFileExplorerKeyboardScope(deps);
    return;
  }

  if (!itemId) {
    return;
  }

  store.setSelectedFolderId({ folderId: undefined });
  store.setSelectedItemId({ itemId });
  closeMobileResourceFileExplorerAfterSelection(deps);
  render();
  focusFileExplorerKeyboardScope(deps);
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
  fileexplorer?.selectItem?.({ itemId });
  store.setSelectedFolderId({ folderId: undefined });
  store.setSelectedItemId({ itemId });
  render();
};

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  const itemId = store.selectSelectedItemId();
  if (!itemId) {
    openFolderNameDialogWithValues({
      deps,
      folderId: store.selectSelectedFolderId(),
    });
    return;
  }

  openVariableEditDialog({ deps, itemId });
};

export const handleFolderNameDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeFolderNameDialog();
  render();
};

export const handleFolderNameFormAction = async (deps, payload) => {
  const { appService, store, render } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Folder name is required.",
      title: "Warning",
    });
    return;
  }

  const folderId = store.getState().folderNameDialogItemId;
  if (!folderId) {
    store.closeFolderNameDialog();
    render();
    return;
  }

  await handleFileExplorerAction(deps, {
    _event: {
      detail: {
        value: "rename-item-confirmed",
        itemId: folderId,
        newName: name,
      },
    },
  });
  store.closeFolderNameDialog();
  render();
};

export const handleVariableFormAddOptionClick = (deps, payload) => {
  const detail = payload?._event?.detail ?? {};
  const fieldName = detail.fieldName ?? detail.name;
  if (fieldName !== "tagIds") {
    return;
  }

  openCreateTagDialogForMode({
    deps,
    mode: "form",
  });
};

export const handleVariableCreated = async (deps, payload) => {
  const { appService, projectService } = deps;
  const {
    groupId,
    name,
    description,
    tagIds,
    scope,
    type,
    isEnum,
    enumValues,
    default: defaultValue,
  } = payload._event.detail;

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to create variable.",
    action: () =>
      projectService.createVariable({
        variableId: generateId(),
        data: createVariableResourceData({
          name,
          description,
          tagIds,
          scope,
          type,
          isEnum,
          enumValues,
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
    tagIds,
    scope,
    type,
    isEnum,
    enumValues,
    default: defaultValue,
  } = payload._event.detail;

  if (!itemId) {
    return;
  }
  const data = {
    name,
    description: description ?? "",
    scope,
    default: defaultValue,
    value: defaultValue,
  };
  const selectedItem = store.selectSelectedItem();
  const variableType = type ?? selectedItem?.type;
  const normalizedTagIds = normalizeOptionalTagIds(tagIds);

  if (variableType === "string") {
    data.isEnum = isEnum === true;
    data.enumValues =
      isEnum === true ? normalizeVariableEnumValues(enumValues) : [];
  }

  if (normalizedTagIds !== undefined) {
    data.tagIds = normalizedTagIds;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update variable.",
    action: () =>
      projectService.updateVariable({
        variableId: itemId,
        data,
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
