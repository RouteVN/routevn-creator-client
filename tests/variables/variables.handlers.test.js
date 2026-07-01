import { describe, expect, it, vi } from "vitest";
import { handleVariableCreated } from "../../src/pages/variables/variables.handlers.js";
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
  },
  render: vi.fn(),
  refs: {},
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
});
