import { createResourceFileExplorerHandlers } from "../../fileExplorer.js";
import { createProjectStateStream } from "../../../../deps/services/shared/projectStateStream.js";
import { tap } from "rxjs";

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
}) => {
  const refreshData = async (deps) => {
    const { store, render, projectService } = deps;
    const repositoryState = projectService.getRepositoryState();
    const data = selectData(repositoryState);
    store.setItems({ data });
    onProjectStateChanged({ deps, repositoryState });
    render();
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
    handleFileExplorerSelectionChanged,
    handleFileExplorerAction,
    handleFileExplorerTargetChanged,
    handleItemClick,
    handleSearchInput,
  };
};
