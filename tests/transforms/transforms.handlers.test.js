import { describe, expect, it, vi } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  handleAddFormAction,
  handleDetailHeaderClick,
  handleEditFormAction,
  handleFileExplorerAction,
  handleMobileDetailOpenClick,
  handleTransformItemDoubleClick,
  handleTransformItemEdit,
} from "../../src/pages/transforms/transforms.handlers.js";

const createRefreshDeps = (repositoryState, overrides = {}) => {
  let selectedItemId;
  return {
    i18n: EN_I18N,
    appService: {
      getPayload: vi.fn(() => ({ p: "project-1" })),
      navigate: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
    },
    projectService: {
      getRepositoryState: vi.fn(() => repositoryState),
      ...overrides.projectService,
    },
    store: {
      setItems: vi.fn(),
      setSelectedFolderId: vi.fn(),
      setSelectedItemId: vi.fn(({ itemId }) => {
        selectedItemId = itemId;
      }),
      selectSelectedItemId: vi.fn(() => selectedItemId),
      setTagsData: vi.fn(),
      setDefaultDialogueAvatarTransformId: vi.fn(),
      selectTransformItemById: vi.fn(
        ({ itemId }) => repositoryState.transforms.items[itemId],
      ),
      ...overrides.store,
    },
    refs: { fileExplorer: { selectItem: vi.fn() }, ...overrides.refs },
    render: vi.fn(),
  };
};

describe("transforms.handlers", () => {
  it("opens transforms in the dedicated editor", async () => {
    const deps = {
      appService: {
        getPayload: vi.fn(() => ({ p: "project-1" })),
        navigate: vi.fn(),
      },
      store: { selectSelectedItemId: vi.fn(() => "transform-1") },
    };

    handleTransformItemDoubleClick(deps, {
      _event: { detail: { itemId: "transform-1" } },
    });
    handleTransformItemEdit(deps, {
      _event: { detail: { itemId: "transform-1" } },
    });
    handleMobileDetailOpenClick(deps);
    await handleFileExplorerAction(deps, {
      _event: {
        detail: { itemId: "transform-1", item: { value: "edit-item" } },
      },
    });

    expect(deps.appService.navigate).toHaveBeenCalledTimes(4);
    for (const call of deps.appService.navigate.mock.calls) {
      expect(call).toEqual([
        "/project/transform-editor",
        { p: "project-1", t: "transform-1" },
      ]);
    }
  });

  it("does not open the editor when a folder is double-clicked", () => {
    const deps = { appService: { navigate: vi.fn() } };

    handleTransformItemDoubleClick(deps, {
      _event: { detail: { itemId: "folder-1", isFolder: true } },
    });

    expect(deps.appService.navigate).not.toHaveBeenCalled();
  });

  it("creates a transform from its name, description, and tags and keeps it selected", async () => {
    const repositoryState = {
      project: {},
      transforms: { items: {}, tree: [] },
    };
    const deps = createRefreshDeps(repositoryState, {
      projectService: {
        createTransform: vi.fn(async ({ transformId, data }) => {
          repositoryState.transforms.items[transformId] = {
            id: transformId,
            ...data,
          };
          repositoryState.transforms.tree.push({ id: transformId });
          return { valid: true };
        }),
      },
      store: {
        selectTargetGroupId: vi.fn(() => "folder-1"),
        closeAddDialog: vi.fn(),
      },
    });

    await handleAddFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: " Transform One ",
            description: "Description",
            tagIds: ["tag-1"],
          },
        },
      },
    });

    expect(deps.projectService.createTransform).toHaveBeenCalledWith({
      transformId: expect.any(String),
      data: {
        type: "transform",
        name: "Transform One",
        description: "Description",
        tagIds: ["tag-1"],
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        anchorX: 0,
        anchorY: 0,
        rotation: 0,
      },
      parentId: "folder-1",
      position: "last",
    });
    const { transformId } =
      deps.projectService.createTransform.mock.calls[0][0];
    expect(deps.appService.navigate).not.toHaveBeenCalled();
    expect(deps.store.closeAddDialog).toHaveBeenCalledOnce();
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: transformId,
    });
  });

  it("asks for a name before creating a transform", async () => {
    const deps = createRefreshDeps(
      { project: {}, transforms: { items: {}, tree: [] } },
      { projectService: { createTransform: vi.fn() } },
    );

    await handleAddFormAction(deps, {
      _event: {
        detail: { actionId: "submit", values: { name: "  " } },
      },
    });

    expect(deps.projectService.createTransform).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Transform name is required.",
      title: "Warning",
    });
  });

  it("edits the name, description, and tags from the detail header", async () => {
    const item = {
      id: "transform-1",
      type: "transform",
      name: "Old Name",
      description: "Old description",
      tagIds: ["tag-1"],
      x: 960,
    };
    const repositoryState = {
      project: {},
      transforms: { items: { "transform-1": item }, tree: [{ id: item.id }] },
    };
    const editForm = { reset: vi.fn(), setValues: vi.fn() };
    const deps = createRefreshDeps(repositoryState, {
      projectService: {
        updateTransform: vi.fn(async ({ data }) => {
          Object.assign(item, data);
          return { valid: true };
        }),
      },
      store: {
        selectSelectedItemId: vi.fn(() => "transform-1"),
        openEditDialog: vi.fn(),
        selectEditItemId: vi.fn(() => "transform-1"),
        closeEditDialog: vi.fn(),
      },
      refs: { editForm },
    });

    handleDetailHeaderClick(deps);

    const editValues = {
      name: "Old Name",
      description: "Old description",
      tagIds: ["tag-1"],
    };
    expect(deps.store.openEditDialog).toHaveBeenCalledWith({
      itemId: "transform-1",
      defaultValues: editValues,
    });
    expect(editForm.reset).toHaveBeenCalledOnce();
    expect(editForm.setValues).toHaveBeenCalledWith({ values: editValues });

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: " New Name ",
            description: "New description",
            tagIds: ["tag-1", "tag-2"],
          },
        },
      },
    });

    expect(deps.projectService.updateTransform).toHaveBeenCalledWith({
      transformId: "transform-1",
      data: {
        name: "New Name",
        description: "New description",
        tagIds: ["tag-1", "tag-2"],
      },
    });
    expect(deps.store.closeEditDialog).toHaveBeenCalledOnce();
  });

  it("duplicates a transform from the file explorer with its values and preview", async () => {
    const item = {
      id: "transform-1",
      type: "transform",
      name: "Transform One",
      description: "",
      tagIds: [],
      x: 960,
      y: 540,
      scaleX: 2,
      scaleY: 2,
      anchorX: 0.5,
      anchorY: 1,
      rotation: 15,
      thumbnailFileId: "thumb-1",
      previewFileId: "preview-1",
      preview: { background: { imageId: "image-1" } },
    };
    const repositoryState = {
      project: {},
      transforms: { items: { "transform-1": item }, tree: [{ id: item.id }] },
    };
    const deps = createRefreshDeps(repositoryState, {
      projectService: {
        createTransform: vi.fn(async () => ({ valid: true })),
      },
    });

    await handleFileExplorerAction(deps, {
      _event: {
        detail: { itemId: "transform-1", item: { value: "duplicate-item" } },
      },
    });

    expect(deps.projectService.createTransform).toHaveBeenCalledWith({
      transformId: expect.any(String),
      data: {
        type: "transform",
        name: "Transform One",
        description: "",
        tagIds: [],
        x: 960,
        y: 540,
        scaleX: 2,
        scaleY: 2,
        anchorX: 0.5,
        anchorY: 1,
        rotation: 15,
        thumbnailFileId: "thumb-1",
        previewFileId: "preview-1",
        preview: { background: { imageId: "image-1" } },
      },
      parentId: null,
      position: "after",
      positionTargetId: "transform-1",
    });
  });
});
