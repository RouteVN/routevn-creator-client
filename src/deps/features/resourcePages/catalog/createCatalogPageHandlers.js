import { createResourceFileExplorerHandlers } from "../../fileExplorerHandlers.js";
import { createProjectStateStream } from "../../projectStateStream.js";
import { tap } from "rxjs";

const EMPTY_TREE = { tree: [], items: {} };

export const createCatalogPageHandlers = ({
  resourceType,
  createExplorerHandlers = ({ refresh }) =>
    createResourceFileExplorerHandlers({
      resourceType,
      refresh,
    }),
}) => {
  const refreshData = async (deps) => {
    const { store, render, projectService } = deps;
    const data = projectService.getState()[resourceType] ?? EMPTY_TREE;
    store.setItems({ data });
    render();
  };

  const handleBeforeMount = (deps) => {
    const { projectService, store, render } = deps;
    const subscription = createProjectStateStream({ projectService })
      .pipe(
        tap(({ repositoryState }) => {
          const data = repositoryState?.[resourceType] ?? EMPTY_TREE;
          store.setItems({ data });
          render();
        }),
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const handleAfterMount = async ({ projectService }) => {
    await projectService.ensureRepository();
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

  const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
    createExplorerHandlers({ refresh: refreshData });

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

  const handleSearchInput = (deps, payload) => {
    const { store, render } = deps;
    store.setSearchQuery({ value: payload._event.detail.value ?? "" });
    render();
  };

  return {
    refreshData,
    handleBeforeMount,
    handleAfterMount,
    handleFileExplorerSelectionChanged,
    handleFileExplorerAction,
    handleFileExplorerTargetChanged,
    handleItemClick,
    handleSearchInput,
  };
};
