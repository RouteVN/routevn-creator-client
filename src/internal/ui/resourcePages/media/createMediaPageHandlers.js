import { createResourceFileExplorerHandlers } from "../../fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../fileExplorerKeyboardScope.js";
import { createProjectStateStream } from "../../../../deps/services/shared/projectStateStream.js";
import { syncMediaPageData } from "./mediaPageShared.js";
import { tap } from "rxjs";
import { createResourcePageTagHandlers } from "../tags.js";
import {
  closeMobileResourceFileExplorerAfterSelection,
  shouldSuppressMobileDetailSheetForFileExplorerSelection,
} from "../mobileResourcePage.js";
import { handleResourceZoomShortcutKeyDown } from "../zoomShortcuts.js";

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
  onEnterKey,
  onEditKey,
  tagging,
  copy,
}) => {
  const resolveCopy = (deps) => {
    if (typeof copy === "function") {
      return copy(deps);
    }

    return copy ?? {};
  };

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
      if (nextItem?.type === "folder") {
        store.setSelectedFolderId({ folderId: selectedItemId });
      } else {
        store.setSelectedFolderId({ folderId: undefined });
        store.setSelectedItemId({
          itemId: nextItem ? selectedItemId : undefined,
        });
      }
    }

    render();

    if (selectedItemId) {
      refs?.fileExplorer?.selectItem?.({ itemId: selectedItemId });
    }
  };

  const openEditDialogWithValues = ({ deps, itemId } = {}) => {
    const { store, refs, render } = deps;
    const { fileExplorer } = refs;

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
    refs.editForm?.reset?.();
    refs.editForm?.setValues?.({ values: editValues });
  };

  const openFolderNameDialogWithValues = ({ deps, folderId } = {}) => {
    const { store, refs, render } = deps;
    const { fileExplorer } = refs;

    if (!folderId) {
      return;
    }

    const folder = store.selectFolderById({ folderId });
    if (!folder) {
      return;
    }

    const values = {
      name: folder.name ?? "",
      description: folder.description ?? "",
    };

    store.setSelectedFolderId({ folderId });
    fileExplorer?.selectItem?.({ itemId: folderId });
    store.openFolderNameDialog({
      folderId,
      defaultValues: values,
    });
    render();
    refs.folderNameForm?.reset?.();
    refs.folderNameForm?.setValues?.({ values });
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
    deps.store.setUiConfig?.({ uiConfig: deps.uiConfig });
    return mountSubscriptions(deps);
  };

  const handleAfterMount = (deps) => {
    focusKeyboardScope(deps);
  };

  const handleFileExplorerSelectionChanged = (deps, payload) => {
    const { store, render, refs } = deps;
    const { itemId, isFolder } = payload._event.detail;

    if (isFolder) {
      store.setSelectedFolderId({ folderId: itemId });
      store.setSelectedItemId({ itemId: undefined });
      render();
      focusKeyboardScope(deps);
      return;
    }

    if (!itemId) {
      return;
    }

    store.setSelectedFolderId({ folderId: undefined });
    const suppressMobileDetailSheet =
      shouldSuppressMobileDetailSheetForFileExplorerSelection(deps);
    const selectionPayload = { itemId };
    if (suppressMobileDetailSheet) {
      selectionPayload.suppressMobileDetailSheet = true;
    }
    store.setSelectedItemId(selectionPayload);
    closeMobileResourceFileExplorerAfterSelection(deps);
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

  const handleEditKey = ({ deps, selectedItemId, selectedExplorerItem }) => {
    const selectedStoreItemId = deps.store.selectSelectedItemId();
    const isFolder =
      selectedStoreItemId === selectedItemId
        ? false
        : (selectedExplorerItem?.isFolder ??
          deps.store.selectSelectedFolderId() === selectedItemId);

    if (isFolder) {
      openFolderNameDialogWithValues({ deps, folderId: selectedItemId });
      return;
    }

    openEditDialogWithValues({ deps, itemId: selectedItemId });
  };

  const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
    createResourceFileExplorerHandlers({
      resourceType,
      refresh: refreshData,
      copy: resolveCopy,
    });
  const {
    focusKeyboardScope,
    handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
    handleKeyboardScopeKeyDown: handleBaseFileExplorerKeyboardScopeKeyDown,
  } = createFileExplorerKeyboardScopeHandlers({
    onEnterKey,
    onEditKey: onEditKey ?? handleEditKey,
    resolveSelectedItemId: ({ deps, selectedExplorerItem }) =>
      deps.store.selectSelectedItemId() ??
      selectedExplorerItem?.itemId ??
      deps.store.selectSelectedFolderId(),
  });

  const handleFileExplorerKeyboardScopeKeyDown = (deps, payload) => {
    if (handleResourceZoomShortcutKeyDown(deps, payload)) {
      return;
    }

    handleBaseFileExplorerKeyboardScopeKeyDown(deps, payload);
  };

  const handleEditDialogClose = (deps) => {
    const { store, render } = deps;

    store.closeEditDialog();
    render();
    focusKeyboardScope(deps);
  };

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

  const handleItemDoubleClick = (deps, payload) => {
    const { itemId } = payload._event.detail;
    openEditDialogWithValues({ deps, itemId });
  };

  const handleItemEdit = (deps, payload) => {
    const { itemId } = payload._event.detail;
    openEditDialogWithValues({ deps, itemId });
  };

  const handleFolderNameDialogClose = (deps) => {
    const { store, render } = deps;
    store.closeFolderNameDialog();
    render();
    focusKeyboardScope(deps);
  };

  const handleFolderNameFormAction = async (deps, payload) => {
    const { appService, store } = deps;
    const resolvedCopy = resolveCopy(deps);
    const { actionId, values } = payload._event.detail;
    if (actionId !== "submit") {
      return;
    }

    const name = values?.name?.trim();
    const description = values?.description?.trim() ?? "";

    if (!name) {
      appService.showAlert({
        message: resolvedCopy.folderNameRequired ?? "Folder name is required.",
        title: resolvedCopy.warningTitle ?? "Warning",
      });
      return;
    }

    const folderId = store.selectFolderNameDialogItemId();
    if (!folderId) {
      handleFolderNameDialogClose(deps);
      return;
    }

    await handleFileExplorerAction(deps, {
      _event: {
        detail: {
          value: "rename-item-confirmed",
          itemId: folderId,
          newName: name,
          description,
        },
      },
    });
    handleFolderNameDialogClose(deps);
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
        refreshAfterItemTagUpdate: ({ deps, itemId, itemStillSelected }) =>
          refreshData(deps, {
            selectedItemId: itemStillSelected ? itemId : undefined,
          }),
        appendCreatedTagByMode: tagging.appendCreatedTagByMode,
        getSelectedItemId: tagging.getSelectedItemId,
        getSelectedItemTagIds: tagging.getSelectedItemTagIds,
        createTagFallbackMessage: tagging.createTagFallbackMessage,
        updateItemTagFallbackMessage: tagging.updateItemTagFallbackMessage,
        copy: resolveCopy,
      })
    : {};

  return {
    refreshData,
    openEditDialogWithValues,
    openFolderNameDialogWithValues,
    handleBeforeMount,
    handleAfterMount,
    handleFileExplorerSelectionChanged,
    handleFileExplorerDoubleClick,
    handleFileExplorerAction,
    handleFileExplorerTargetChanged,
    handleFileExplorerKeyboardScopeClick,
    handleFileExplorerKeyboardScopeKeyDown,
    handleEditDialogClose,
    handleItemClick,
    handleItemDoubleClick,
    handleItemEdit,
    handleFolderNameDialogClose,
    handleFolderNameFormAction,
    handleSearchInput,
    handleMobileFileExplorerOpen,
    handleMobileFileExplorerClose,
    handleMobileDetailSheetClose,
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
