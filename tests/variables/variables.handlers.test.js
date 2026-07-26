import { describe, expect, it, vi } from "vitest";
import {
  handleDataChanged,
  handleVariableCreated,
  handleVariableDelete,
  handleVariableUpdated,
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
        variableType: "number",
        scope: "context",
        default: 0,
        value: 0,
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
    deleteVariables: vi.fn(),
    getRepositoryState: vi.fn(() => repositoryState),
    getState: vi.fn(() => repositoryState),
    updateVariable: vi.fn(),
  },
  store: {
    setItems: vi.fn(),
    setTagsData: vi.fn(),
    setSelectedFolderId: vi.fn(),
    setSelectedItemId: vi.fn(),
    selectSelectedItem: vi.fn(
      () => repositoryState.variables.items.variable1,
    ),
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

  it("creates stored number variables with a zero default when omitted", async () => {
    const deps = createDeps();

    await handleVariableCreated(deps, {
      _event: {
        detail: {
          groupId: "folder1",
          name: "Level",
          description: "",
          scope: "context",
          variableType: "number",
        },
      },
    });

    expect(deps.projectService.createVariable).toHaveBeenCalledWith({
      variableId: expect.any(String),
      parentId: "folder1",
      position: "last",
      data: {
        type: "variable",
        name: "Level",
        description: "",
        scope: "context",
        variableType: "number",
        default: 0,
        value: 0,
      },
    });
  });

  it("updates stored number variables with a zero default when omitted", async () => {
    const deps = createDeps();

    await handleVariableUpdated(deps, {
      _event: {
        detail: {
          itemId: "variable1",
          name: "Score",
          description: "",
          scope: "context",
          variableType: "number",
        },
      },
    });

    expect(deps.projectService.updateVariable).toHaveBeenCalledWith({
      variableId: "variable1",
      data: {
        name: "Score",
        description: "",
        scope: "context",
        default: 0,
        value: 0,
      },
    });
  });

  it("creates a computed variable without stored values", async () => {
    const deps = createDeps();
    const computed = {
      expr: {
        add: [{ var: "variables.variable1" }, 5],
      },
    };

    await handleVariableCreated(deps, {
      _event: {
        detail: {
          groupId: "folder1",
          name: "Score with bonus",
          description: "",
          variableType: "number",
          computed,
        },
      },
    });

    expect(deps.projectService.createVariable).toHaveBeenCalledWith({
      variableId: expect.any(String),
      parentId: "folder1",
      position: "last",
      data: {
        type: "variable",
        name: "Score with bonus",
        description: "",
        variableType: "number",
        computed,
      },
    });
    const data = deps.projectService.createVariable.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("default");
    expect(data).not.toHaveProperty("value");
    expect(data).not.toHaveProperty("scope");
  });

  it("keeps the dialog open when engine validation rejects a formula", async () => {
    const deps = createDeps();

    await handleVariableCreated(deps, {
      _event: {
        detail: {
          groupId: "folder1",
          name: "Broken",
          description: "",
          variableType: "number",
          computed: {
            expr: { var: "variables.missing" },
          },
        },
      },
    });

    expect(deps.projectService.createVariable).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "The computed formula is invalid. Review it and try again.",
      title: "Warning",
    });
    expect(deps.render).not.toHaveBeenCalled();
  });

  it("blocks deletion when another computed variable depends on the target", async () => {
    const repositoryState = createRepositoryState();
    repositoryState.variables.items.computed1 = {
      id: "computed1",
      type: "variable",
      name: "Score label",
      variableType: "string",
      computed: { expr: { var: "variables.variable1" } },
    };
    const deps = createDeps({ repositoryState });

    await handleVariableDelete(deps, {
      _event: { detail: { itemId: "variable1" } },
    });

    expect(deps.projectService.deleteVariables).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "This variable is used by: Score label",
      title: "Warning",
    });
  });
});
