import { describe, expect, it, vi } from "vitest";
import { createVariablesFileExplorerHandlers } from "../../src/internal/ui/fileExplorer.js";

const createRepositoryState = () => ({
  variables: {
    items: {
      folder: {
        id: "folder",
        type: "folder",
        name: "Internal",
      },
      score: {
        id: "score",
        type: "variable",
        name: "Score",
      },
      internalLabel: {
        id: "internalLabel",
        type: "variable",
        name: "Internal label",
        computed: { expr: { var: "variables.score" } },
      },
      externalLabel: {
        id: "externalLabel",
        type: "variable",
        name: "External label",
        computed: { expr: { var: "variables.score" } },
      },
    },
    tree: [
      {
        id: "folder",
        children: [{ id: "score" }, { id: "internalLabel" }],
      },
      { id: "externalLabel" },
    ],
  },
});

const createDeps = ({ repositoryState = createRepositoryState() } = {}) => ({
  appService: {
    showAlert: vi.fn(),
  },
  projectService: {
    checkResourceUsage: vi.fn(async () => ({ isUsed: false })),
    deleteVariables: vi.fn(async () => ({ valid: true })),
    ensureRepository: vi.fn(async () => {}),
    getRepositoryState: vi.fn(() => repositoryState),
    getState: vi.fn(() => repositoryState),
  },
});

const deleteExplorerItem = async (handlers, deps, itemId) => {
  await handlers.handleFileExplorerAction(deps, {
    _event: {
      detail: {
        itemId,
        item: {
          value: "delete-item",
        },
      },
    },
  });
};

describe("variables file explorer", () => {
  it("names the computed variable blocking item deletion", async () => {
    const deps = createDeps();
    const handlers = createVariablesFileExplorerHandlers({
      copy: {
        computedVariableDeleteBlocked: "This variable is used by: {dependents}",
      },
    });

    await deleteExplorerItem(handlers, deps, "score");

    expect(deps.projectService.deleteVariables).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "This variable is used by: Internal label, External label",
    });
  });

  it("checks folder descendants and ignores dependents deleted with them", async () => {
    const deps = createDeps();
    const handlers = createVariablesFileExplorerHandlers({
      copy: {
        computedVariableDeleteBlocked: "This variable is used by: {dependents}",
      },
    });

    await deleteExplorerItem(handlers, deps, "folder");

    expect(deps.projectService.deleteVariables).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "This variable is used by: External label",
    });
  });

  it("allows deleting a folder when all dependents are in its subtree", async () => {
    const repositoryState = createRepositoryState();
    delete repositoryState.variables.items.externalLabel;
    repositoryState.variables.tree.pop();
    const deps = createDeps({ repositoryState });
    const refresh = vi.fn(async () => {});
    const handlers = createVariablesFileExplorerHandlers({ refresh });

    await deleteExplorerItem(handlers, deps, "folder");

    expect(deps.projectService.deleteVariables).toHaveBeenCalledWith({
      variableIds: ["folder"],
    });
    expect(refresh).toHaveBeenCalledWith(deps, {
      deletedItemId: "folder",
    });
  });
});
