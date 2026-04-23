import { createResourceFileExplorerHandlers } from "../../fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../fileExplorerKeyboardScope.js";
import { createProjectStateStream } from "../../../../deps/services/shared/projectStateStream.js";
import { syncMediaPageData } from "./mediaPageShared.js";
import { tap } from "rxjs";
import { createResourcePageTagHandlers } from "../tags.js";

export const createMediaPageHandlers = ({
  resourceType,
  subscriptions,
  syncData = ({ store, repositoryState }) =>
    syncMediaPageData({
      store,
      repositoryState,
      resourceType,
    }),
  selectItemById = (store, { itemId }) => store.selectItemById({ itemId }),
  getEditValues = (item) => ({
    name: item?.name ?? "",
    description: item?.description ?? "",
  }),
  getEditPreviewFileId = () => undefined,
  tagging,
}) => {
  const waitForExpectedMediaState = async (
    deps,
    { selectedItemId, deletedItemId } = {},
  ) => {
    const { projectService } = deps;
    const matchesExpectation = (repositoryState) => {
      const collection = repositoryState?.[resourceType];
      if (
        selectedItemId !== undefined &&
        !collection?.items?.[selectedItemId]
      ) {
        return false;
      }

      if (
        deletedItemId !== undefined &&
        collection?.items?.[deletedItemId] !== undefined
      ) {
        return false;
      }

      return true;
    };

    const currentState =
      projectService.getRepositoryState?.() ?? projectService.getState();
    if (matchesExpectation(currentState)) {
      return currentState;
    }

    return new Promise((resolve) => {
      let settled = false;
      let cleanupSubscription;
      let timeoutId;
      const finish = (repositoryState) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeoutId);
        cleanupSubscription?.();
        resolve(repositoryState);
      };

      cleanupSubscription = projectService.subscribeProjectState(
        ({ domainState, repositoryState }) => {
          const nextState = repositoryState ?? domainState;
          if (matchesExpectation(nextState)) {
            finish(nextState);
          }
        },
        { emitCurrent: false },
      );

      timeoutId = setTimeout(() => {
        finish(
          projectService.getRepositoryState?.() ?? projectService.getState(),
        );
      }, 250);
    });
  };

  const refreshData = async (deps, { selectedItemId, deletedItemId } = {}) => {
    const { store, render, refs } = deps;
    const repositoryState = await waitForExpectedMediaState(deps, {
      selectedItemId,
      deletedItemId,
    });
    syncData({
      store,
      repositoryState,
      resourceType,
    });

    if (selectedItemId !== undefined) {
      const nextItem = repositoryState?.[resourceType]?.items?.[selectedItemId];
      store.setSelectedItemId({
        itemId:
          nextItem && nextItem.type !== "folder" ? selectedItemId : undefined,
      });
    }

    render();

    if (selectedItemId) {
      refs?.fileExplorer?.selectItem?.({ itemId: selectedItemId });
    }
  };

  const openEditDialogWithValues = ({ deps, itemId } = {}) => {
    const { store, refs, render } = deps;
    const { fileExplorer, editForm } = refs;

    if (!itemId) {
      return;
    }

    const item = selectItemById(store, { itemId });
    if (!item) {
      return;
    }

    const editValues = getEditValues(item);

    store.setSelectedItemId({ itemId });
    fileExplorer?.selectItem?.({ itemId });
    store.openEditDialog({
      itemId,
      defaultValues: editValues,
      previewFileId: getEditPreviewFileId(item),
    });
    render();
    editForm.reset();
    editForm.setValues({ values: editValues });
  };

  const mountSubscriptions = (deps) => {
    const { projectService, store, render } = deps;
    const streams = [
      createProjectStateStream({ projectService }).pipe(
        tap(({ repositoryState }) => {
          syncData({
            store,
            repositoryState,
            resourceType,
          });
          render();
        }),
      ),
      ...(subscriptions?.(deps) ?? []),
    ];

    if (!streams.length) {
      return undefined;
    }

    const active = streams.map((stream) => stream.subscribe());
    return () =>
      active.forEach((subscription) => subscription?.unsubscribe?.());
  };

  const handleBeforeMount = (deps) => {
    return mountSubscriptions(deps);
  };

  const handleAfterMount = (deps) => {
    focusKeyboardScope(deps);
  };

  const handleFileExplorerSelectionChanged = (deps, payload) => {
    const { store, render, refs } = deps;
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

    store.setSelectedItemId({ itemId });
    render();
    refs.groupview?.scrollItemIntoView?.({ itemId });
    focusKeyboardScope(deps);
  };

  const handleFileExplorerDoubleClick = (deps, payload) => {
    const { itemId, isFolder } = payload._event.detail;
    if (isFolder) {
      return;
    }

    openEditDialogWithValues({ deps, itemId });
  };

  const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
    createResourceFileExplorerHandlers({
      resourceType,
      refresh: refreshData,
    });
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

    store.setSelectedItemId({ itemId });
    refs.fileExplorer?.selectItem?.({ itemId });
    render();
  };

  const handleItemDoubleClick = (deps, payload) => {
    const { itemId } = payload._event.detail;
    openEditDialogWithValues({ deps, itemId });
  };

  const handleItemEdit = (deps, payload) => {
    const { itemId } = payload._event.detail;
    openEditDialogWithValues({ deps, itemId });
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
    openEditDialogWithValues,
    handleBeforeMount,
    handleAfterMount,
    handleFileExplorerSelectionChanged,
    handleFileExplorerDoubleClick,
    handleFileExplorerAction,
    handleFileExplorerTargetChanged,
    handleFileExplorerKeyboardScopeClick,
    handleFileExplorerKeyboardScopeKeyDown,
    handleItemClick,
    handleItemDoubleClick,
    handleItemEdit,
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
