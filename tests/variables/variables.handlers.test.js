import { describe, expect, it, vi } from "vitest";
import {
  handleDataChanged,
  handleVariableCreated,
} from "../../src/pages/variables/variables.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const createRepositoryState = () => ({
  tags: {},
  variables: {
    items: {
      folder1: {
        id: "folder1",
        type: "folder",
        name: "Variables",
      },
      variable1: {
        id: "variable1",
        type: "variable",
        name: "Score",
      },
    },
    tree: [
      {
        id: "folder1",
        children: [{ id: "variable1" }],
      },
    ],
  },
});

const createDeps = ({ repositoryState = createRepositoryState() } = {}) => ({
  appService: {
    showAlert: vi.fn(),
  },
  i18n: EN_I18N,
  projectService: {
    createVariable: vi.fn(),
    getRepositoryState: vi.fn(() => repositoryState),
    getState: vi.fn(() => repositoryState),
  },
  store: {
    setItems: vi.fn(),
    setTagsData: vi.fn(),
    setSelectedFolderId: vi.fn(),
    setSelectedItemId: vi.fn(),
    selectVariableTreeItemById: vi.fn(
      ({ itemId }) => repositoryState.variables.items[itemId],
    ),
  },
  render: vi.fn(),
  refs: {
    fileexplorer: {
      selectItem: vi.fn(),
    },
  },
});

describe("variables.handlers", () => {
  it("does not create a variable when the target group is not a folder", async () => {
    const deps = createDeps();

    await handleVariableCreated(deps, {
      _event: {
        detail: {
          groupId: "variable1",
          name: "Level",
          description: "",
          scope: "context",
          variableType: "number",
          default: 0,
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Select a folder before adding a variable.",
      title: "Warning",
    });
    expect(deps.projectService.createVariable).not.toHaveBeenCalled();
    expect(deps.store.setItems).toHaveBeenCalledWith({
      variablesData: expect.objectContaining({
        items: expect.objectContaining({
          folder1: expect.objectContaining({
            type: "folder",
          }),
          variable1: expect.objectContaining({
            type: "variable",
          }),
        }),
      }),
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("preserves selected folders after variables data refresh", async () => {
    const deps = createDeps();

    await handleDataChanged(deps, { selectedItemId: "folder1" });

    expect(deps.store.selectVariableTreeItemById).toHaveBeenCalledWith({
      itemId: "folder1",
    });
    expect(deps.store.setSelectedFolderId).toHaveBeenCalledWith({
      folderId: "folder1",
    });
    expect(deps.store.setSelectedItemId).not.toHaveBeenCalled();
    expect(deps.refs.fileexplorer.selectItem).toHaveBeenCalledWith({
      itemId: "folder1",
    });
  });
});
