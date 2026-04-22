import { createResourceFileExplorerHandlers } from "../../fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../fileExplorerKeyboardScope.js";
import { createProjectStateStream } from "../../../../deps/services/shared/projectStateStream.js";
import { tap } from "rxjs";
import { createResourcePageTagHandlers } from "../tags.js";

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
      store.setSelectedItemId({ itemId: selectedItemId });
    }
    onProjectStateChanged({ deps, repositoryState });
    render();

    if (selectedItemId) {
      refs?.fileExplorer?.selectItem?.({ itemId: selectedItemId });
    }
  };

  const handleBeforeMount = (deps) => {
    const { projectService, store, render } = deps;
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

  const handleFileExplorerSelectionChanged = (deps, payload) => {
    const { store, render } = deps;
    const { itemId, isFolder } = payload._event.detail;

    if (isFolder) {
      store.setSelectedItemId({ itemId: undefined });
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

    store.setSelectedItemId({ itemId });
    render();
    focusKeyboardScope(deps);
  };

  const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
    createExplorerHandlers({ refresh: refreshData });
  const {
    focusKeyboardScope,
    handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
    handleKeyboardScopeKeyDown: handleFileExplorerKeyboardScopeKeyDown,
  } = createFileExplorerKeyboardScopeHandlers();

  const handleItemClick = (deps, payload) => {
    const { store, render, refs } = deps;
    const { itemId } = payload._event.detail;
    if (!itemId) {
      return;
    }

    if (store.selectSelectedItemId() === itemId) {
      return;
    }

    store.setSelectedItemId({ itemId });
    refs.fileExplorer.selectItem({ itemId });
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
    handleBeforeMount,
    handleAfterMount,
    handleFileExplorerSelectionChanged,
    handleFileExplorerAction,
    handleFileExplorerTargetChanged,
    handleFileExplorerKeyboardScopeClick,
    handleFileExplorerKeyboardScopeKeyDown,
    handleItemClick,
    handleSearchInput,
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
