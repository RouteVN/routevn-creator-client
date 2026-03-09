import { createResourceFileExplorerHandlers } from "../../fileExplorerHandlers.js";
import { syncMediaPageData } from "./mediaPageShared.js";

export const createMediaPageHandlers = ({
  resourceType,
  subscriptions,
  selectItemById = (store, { itemId }) => store.selectItemById({ itemId }),
  getEditValues = (item) => ({
    name: item?.name ?? "",
    description: item?.description ?? "",
  }),
  getEditPreviewFileId = () => undefined,
}) => {
  const getRuntime = (refs) => {
    refs.__mediaPageRuntime ??= {};
    return refs.__mediaPageRuntime;
  };

  const refreshData = async (deps) => {
    const { store, render, projectService } = deps;
    syncMediaPageData({
      store,
      projectService,
      resourceType,
    });
    render();
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
    fileExplorer.selectItem({ itemId });
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
    const streams = subscriptions?.(deps) ?? [];
    if (!streams.length) {
      return undefined;
    }

    const active = streams.map((stream) => stream.subscribe());
    return () =>
      active.forEach((subscription) => subscription?.unsubscribe?.());
  };

  const handleBeforeMount = (deps) => {
    const runtime = getRuntime(deps.refs);
    const cleanupStreams = mountSubscriptions(deps);

    return () => {
      runtime.cleanupProjectSubscription?.();
      runtime.cleanupProjectSubscription = undefined;
      cleanupStreams?.();
    };
  };

  const handleAfterMount = async (deps) => {
    const { projectService, store, render, refs } = deps;
    const runtime = getRuntime(refs);

    await projectService.ensureRepository();
    runtime.cleanupProjectSubscription?.();
    runtime.cleanupProjectSubscription =
      await projectService.subscribeProjectState(({ repositoryState }) => {
        syncMediaPageData({
          store,
          repositoryState,
          resourceType,
        });
        render();
      });
  };

  const handleFileExplorerSelectionChanged = (deps, payload) => {
    const { store, render } = deps;
    const { itemId, isFolder } = payload._event.detail;

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

  const handleItemClick = (deps, payload) => {
    const { store, render, refs } = deps;
    const { itemId } = payload._event.detail;
    if (!itemId) {
      return;
    }

    store.setSelectedItemId({ itemId });
    refs.fileExplorer.selectItem({ itemId });
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

  return {
    refreshData,
    openEditDialogWithValues,
    handleBeforeMount,
    handleAfterMount,
    handleFileExplorerSelectionChanged,
    handleFileExplorerDoubleClick,
    handleFileExplorerAction,
    handleFileExplorerTargetChanged,
    handleItemClick,
    handleItemDoubleClick,
    handleItemEdit,
    handleSearchInput,
  };
};
