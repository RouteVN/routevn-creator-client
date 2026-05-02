import { createResourceFileExplorerHandlers } from "../../fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../fileExplorerKeyboardScope.js";
import { createProjectStateStream } from "../../../../deps/services/shared/projectStateStream.js";
import { tap } from "rxjs";
import { createResourcePageTagHandlers } from "../tags.js";
import { handleResourceZoomShortcutKeyDown } from "../zoomShortcuts.js";

const EMPTY_TREE = { tree: [], items: {} };

export const createCatalogPageHandlers = ({
  resourceType,
  selectData = (repositoryState) =>
    repositoryState?.[resourceType] ?? EMPTY_TREE,
  onProjectStateChanged = () => {},
  createExplorerHandlers = ({ refresh }) =>
    createResourceFileExplorerHandlers({
      resourceType,
      refresh,
    }),
  tagging,
}) => {
  const refreshData = async (deps, { selectedItemId } = {}) => {
    const { store, render, projectService, refs } = deps;
    const repositoryState = projectService.getRepositoryState();
    const data = selectData(repositoryState);
    store.setItems({ data });
    if (selectedItemId !== undefined) {
      const nextItem = data?.items?.[selectedItemId];
      if (nextItem?.type === "folder" && store.setSelectedFolderId) {
        store.setSelectedFolderId({ folderId: selectedItemId });
      } else {
        store.setSelectedFolderId?.({ folderId: undefined });
        store.setSelectedItemId({
          itemId: nextItem ? selectedItemId : undefined,
        });
      }
    }
    onProjectStateChanged({ deps, repositoryState });
    render();

    if (selectedItemId) {
      refs?.fileExplorer?.selectItem?.({ itemId: selectedItemId });
    }
  };

  const handleBeforeMount = (deps) => {
    const { projectService, store, render } = deps;
    store.setUiConfig?.({ uiConfig: deps.uiConfig });
    const subscription = createProjectStateStream({ projectService })
      .pipe(
        tap(({ repositoryState }) => {
          const data = selectData(repositoryState);
          store.setItems({ data });
          onProjectStateChanged({ deps, repositoryState });
          render();
        }),
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const handleAfterMount = (deps) => {
    focusKeyboardScope(deps);
  };

  const openFolderNameDialogWithValues = ({ deps, folderId } = {}) => {
    const { store, refs, render } = deps;
    const { fileExplorer, folderNameForm } = refs;

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
    fileExplorer?.selectItem?.({ itemId: folderId });
    store.openFolderNameDialog({
      folderId,
      defaultValues: values,
    });
    render();
    folderNameForm.reset();
    folderNameForm.setValues({ values });
  };

  const handleFileExplorerSelectionChanged = (deps, payload) => {
    const { store, render } = deps;
    const { itemId, isFolder } = payload._event.detail;

    if (isFolder) {
      store.setSelectedFolderId?.({ folderId: itemId });
      if (!store.setSelectedFolderId) {
        store.setSelectedItemId({ itemId: undefined });
      }
      render();
      focusKeyboardScope(deps);
      return;
    }

    if (!itemId) {
      return;
    }

    if (store.selectSelectedItemId() === itemId) {
      focusKeyboardScope(deps);
      return;
    }

    store.setSelectedFolderId?.({ folderId: undefined });
    store.setSelectedItemId({ itemId });
    const state = store.getState();
    if (state.isTouchMode && state.isMobileFileExplorerOpen) {
      store.closeMobileFileExplorer?.();
    }
    render();
    focusKeyboardScope(deps);
  };

  const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
    createExplorerHandlers({ refresh: refreshData });
  const {
    focusKeyboardScope,
    handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
    handleKeyboardScopeKeyDown: handleBaseFileExplorerKeyboardScopeKeyDown,
  } = createFileExplorerKeyboardScopeHandlers();

  const handleFileExplorerKeyboardScopeKeyDown = (deps, payload) => {
    if (handleResourceZoomShortcutKeyDown(deps, payload)) {
      return;
    }

    handleBaseFileExplorerKeyboardScopeKeyDown(deps, payload);
  };

  const handleItemClick = (deps, payload) => {
    const { store, render, refs } = deps;
    const { itemId } = payload._event.detail;
    if (!itemId) {
      return;
    }

    if (store.selectSelectedItemId() === itemId) {
      return;
    }

    store.setSelectedFolderId?.({ folderId: undefined });
    store.setSelectedItemId({ itemId });
    refs.fileExplorer?.selectItem?.({ itemId });
    render();
  };

  const handleMobileFileExplorerOpen = (deps) => {
    const { store, render, refs } = deps;
    const selectedItemId = store.selectSelectedItemId();

    store.openMobileFileExplorer?.();
    render();

    if (selectedItemId) {
      requestAnimationFrame(() => {
        refs.fileExplorer?.selectItem?.({ itemId: selectedItemId });
      });
    }
  };

  const handleMobileFileExplorerClose = (deps) => {
    const { store, render } = deps;

    store.closeMobileFileExplorer?.();
    render();
    focusKeyboardScope(deps);
  };

  const handleMobileDetailSheetClose = (deps) => {
    const { store, render } = deps;

    if (!store.selectSelectedItemId()) {
      return;
    }

    store.setSelectedItemId({ itemId: undefined });
    render();
    focusKeyboardScope(deps);
  };

  const handleFolderNameDialogClose = (deps) => {
    const { store, render } = deps;
    store.closeFolderNameDialog();
    render();
  };

  const handleFolderNameFormAction = async (deps, payload) => {
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

  const handleSearchInput = (deps, payload) => {
    const { store, render } = deps;
    store.setSearchQuery({ value: payload._event.detail.value ?? "" });
    render();
  };

  const resolveTagScopeKey = ({ deps, itemId, mode } = {}) => {
    if (typeof tagging?.resolveScopeKey === "function") {
      return tagging.resolveScopeKey({
        deps,
        itemId,
        mode,
      });
    }

    return tagging?.scopeKey;
  };

  const tagHandlers = tagging
    ? createResourcePageTagHandlers({
        resolveScopeKey: resolveTagScopeKey,
        updateItemTagIds: tagging.updateItemTagIds,
        refreshAfterItemTagUpdate: ({ deps, itemId }) =>
          refreshData(deps, { selectedItemId: itemId }),
        appendCreatedTagByMode: tagging.appendCreatedTagByMode,
        getSelectedItemId: tagging.getSelectedItemId,
        getSelectedItemTagIds: tagging.getSelectedItemTagIds,
        createTagFallbackMessage: tagging.createTagFallbackMessage,
        updateItemTagFallbackMessage: tagging.updateItemTagFallbackMessage,
      })
    : {};

  return {
    refreshData,
    openFolderNameDialogWithValues,
    handleBeforeMount,
    handleAfterMount,
    handleFileExplorerSelectionChanged,
    handleFileExplorerAction,
    handleFileExplorerTargetChanged,
    handleFileExplorerKeyboardScopeClick,
    handleFileExplorerKeyboardScopeKeyDown,
    handleItemClick,
    handleSearchInput,
    handleMobileFileExplorerOpen,
    handleMobileFileExplorerClose,
    handleMobileDetailSheetClose,
    handleFolderNameDialogClose,
    handleFolderNameFormAction,
    openCreateTagDialogForMode: tagHandlers.openCreateTagDialogForMode,
    handleCreateTagDialogClose: tagHandlers.handleCreateTagDialogClose,
    handleTagFilterChange: tagHandlers.handleTagFilterChange,
    handleTagFilterAddOptionClick: tagHandlers.handleTagFilterAddOptionClick,
    handleDetailTagAddOptionClick: tagHandlers.handleDetailTagAddOptionClick,
    handleDetailTagDraftValueChange:
      tagHandlers.handleDetailTagDraftValueChange,
    handleDetailTagOpenChange: tagHandlers.handleDetailTagOpenChange,
    handleDetailTagValueChange: tagHandlers.handleDetailTagValueChange,
    handleCreateTagFormAction: tagHandlers.handleCreateTagFormAction,
  };
};
