import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import * as particlesStore from "../../src/pages/particles/particles.store.js";
import {
  handleAddFormAction,
  handleAddFormAddOptionClick,
  handleAddParticleClick,
  handleCreateTagFormAction,
  handleDataChanged,
  handleDetailHeaderClick,
  handleEditFormAction,
  handleFileExplorerAction,
  handleItemDuplicate,
  handleMobileDetailDuplicateClick,
  handleMobileDetailOpenClick,
  handleParticleItemDoubleClick,
  handleParticleItemEdit,
  handleResourceViewBackgroundClick,
} from "../../src/pages/particles/particles.handlers.js";
import { createParticlePreset } from "../../src/pages/particles/support/particlePresets.js";
import { EN_I18N } from "../support/i18n.js";

const createParticle = () => {
  const rain = createParticlePreset({
    presetId: "rain",
    projectResolution: { width: 640, height: 360 },
  });
  return {
    id: "particle-1",
    type: "particle",
    name: "Particle One",
    description: "Rainfall.",
    tagIds: ["tag-1"],
    width: rain.width,
    height: rain.height,
    seed: rain.seed,
    modules: {
      ...rain.modules,
      appearance: { ...rain.modules.appearance, texture: "image-1" },
    },
    thumbnailFileId: "thumb-1",
  };
};

// The page on its real store, with a project of one particle.
const createPage = async () => {
  let state = particlesStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return particlesStore[name]({ state, i18n: EN_I18N }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = particlesStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  const repositoryState = {
    project: { resolution: { width: 1280, height: 720 } },
    images: { items: {}, tree: [] },
    tags: {
      particles: {
        items: { "tag-1": { id: "tag-1", type: "tag", name: "Weather" } },
        tree: [{ id: "tag-1" }],
      },
    },
    particles: {
      items: {
        "folder-1": { id: "folder-1", type: "folder", name: "Folder One" },
        "particle-1": createParticle(),
      },
      tree: [{ id: "folder-1", children: [{ id: "particle-1" }] }],
    },
  };
  // The store keeps what it reads, frozen, so the project changes by
  // replacing its collections.
  const withItem = (collection, id, data) => ({
    items: { ...collection.items, [id]: { id, ...data } },
    tree: [...collection.tree, { id }],
  });
  const deps = {
    store,
    i18n: EN_I18N,
    render: vi.fn(),
    refs: {
      fileExplorer: { selectItem: vi.fn() },
      addForm: { getValues: vi.fn(() => ({ tagIds: [] })), setValues: vi.fn() },
      editForm: { reset: vi.fn(), setValues: vi.fn() },
    },
    appService: {
      getPayload: vi.fn(() => ({ p: "project-1" })),
      navigate: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
    },
    projectService: {
      getRepositoryState: vi.fn(() => repositoryState),
      createParticle: vi.fn(async ({ particleId, data }) => {
        repositoryState.particles = withItem(
          repositoryState.particles,
          particleId,
          data,
        );
        return { valid: true };
      }),
      updateParticle: vi.fn(async ({ particleId, data }) => {
        const { items, tree } = repositoryState.particles;
        repositoryState.particles = {
          items: { ...items, [particleId]: { ...items[particleId], ...data } },
          tree,
        };
        return { valid: true };
      }),
      createTag: vi.fn(async ({ scopeKey, tagId, data }) => {
        repositoryState.tags = {
          ...repositoryState.tags,
          [scopeKey]: withItem(repositoryState.tags[scopeKey], tagId, data),
        };
        return { valid: true };
      }),
    },
  };
  await handleDataChanged(deps);
  return {
    deps,
    state: () => state,
    view: () => particlesStore.selectViewData({ state, i18n: EN_I18N }),
    repositoryState,
  };
};

const editorCall = (particleId) => [
  "/project/particle-editor",
  { p: "project-1", pt: particleId },
];

describe("particles handlers", () => {
  it("opens particles in the editor", async () => {
    const page = await createPage();
    const { deps } = page;
    deps.store.setSelectedItemId({ itemId: "particle-1" });

    handleParticleItemDoubleClick(deps, {
      _event: { detail: { itemId: "particle-1" } },
    });
    handleParticleItemEdit(deps, {
      _event: { detail: { itemId: "particle-1" } },
    });
    handleMobileDetailOpenClick(deps);
    await handleFileExplorerAction(deps, {
      _event: {
        detail: { itemId: "particle-1", item: { value: "edit-item" } },
      },
    });
    handleParticleItemDoubleClick(deps, {
      _event: { detail: { itemId: "folder-1", isFolder: true } },
    });

    expect(deps.appService.navigate.mock.calls).toEqual([
      editorCall("particle-1"),
      editorCall("particle-1"),
      editorCall("particle-1"),
      editorCall("particle-1"),
    ]);
  });

  it("adds a particle from a preset at the project's size and opens it", async () => {
    const page = await createPage();
    const { deps } = page;
    handleAddParticleClick(deps, { _event: { detail: { groupId: "_root" } } });
    expect(page.view().isAddDialogOpen).toBe(true);

    await handleAddFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: " Particle Two ",
            description: "Sparkles.",
            tagIds: ["tag-1"],
            presetId: "sparkle",
          },
        },
      },
    });

    const sparkle = createParticlePreset({
      presetId: "sparkle",
      projectResolution: { width: 1280, height: 720 },
    });
    const [{ particleId, data, parentId, position }] =
      deps.projectService.createParticle.mock.calls[0];
    expect(data).toEqual({
      type: "particle",
      name: "Particle Two",
      description: "Sparkles.",
      tagIds: ["tag-1"],
      width: 1280,
      height: 720,
      seed: sparkle.seed,
      modules: sparkle.modules,
    });
    // The texture is picked in the editor.
    expect(data.modules.appearance.texture).toBeUndefined();
    expect([parentId, position]).toEqual([undefined, "last"]);
    expect(page.view().isAddDialogOpen).toBe(false);
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      ...editorCall(particleId),
    );
  });

  it("starts the add form on Snow and asks for a name", async () => {
    const page = await createPage();
    const { deps } = page;

    expect(page.view().addFormDefaults).toEqual({
      name: "",
      description: "",
      tagIds: [],
      presetId: "snow",
    });
    await handleAddFormAction(deps, {
      _event: {
        detail: { actionId: "submit", values: { name: " ", presetId: "snow" } },
      },
    });

    expect(deps.projectService.createParticle).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "Particle name is required.",
      title: "Warning",
    });
  });

  it("edits the name, description and tags from the detail header", async () => {
    const page = await createPage();
    const { deps } = page;
    deps.store.setSelectedItemId({ itemId: "particle-1" });

    handleDetailHeaderClick(deps);

    const values = {
      name: "Particle One",
      description: "Rainfall.",
      tagIds: ["tag-1"],
    };
    expect(page.view().isEditDialogOpen).toBe(true);
    expect(page.view().editDefaultValues).toEqual(values);
    expect(deps.refs.editForm.reset).toHaveBeenCalledOnce();
    expect(deps.refs.editForm.setValues).toHaveBeenCalledWith({ values });

    await handleEditFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: { name: "Rain", description: "", tagIds: [] },
        },
      },
    });

    expect(deps.projectService.updateParticle).toHaveBeenCalledWith({
      particleId: "particle-1",
      data: { name: "Rain", description: "", tagIds: [] },
    });
    expect(page.view().isEditDialogOpen).toBe(false);
  });

  it("duplicates a particle with its values, name, tags and thumbnail, in its folder", async () => {
    const page = await createPage();
    const { deps } = page;
    const source = page.repositoryState.particles.items["particle-1"];

    await handleFileExplorerAction(deps, {
      _event: {
        detail: { itemId: "particle-1", item: { value: "duplicate-item" } },
      },
    });

    const [{ particleId, data, parentId, position, positionTargetId }] =
      deps.projectService.createParticle.mock.calls[0];
    expect(data).toEqual({
      type: "particle",
      name: "Particle One",
      description: "Rainfall.",
      tagIds: ["tag-1"],
      width: source.width,
      height: source.height,
      seed: source.seed,
      modules: source.modules,
      thumbnailFileId: "thumb-1",
    });
    expect(data.modules).not.toBe(source.modules);
    expect([parentId, position, positionTargetId]).toEqual([
      "folder-1",
      "after",
      "particle-1",
    ]);
    expect(page.view().selectedItemId).toBe(particleId);

    await handleMobileDetailDuplicateClick(deps);
    await handleItemDuplicate(deps, {
      _event: { detail: { itemId: "particle-1" } },
    });
    expect(deps.projectService.createParticle).toHaveBeenCalledTimes(3);
  });

  it("puts a tag created from the add form into that form", async () => {
    const page = await createPage();
    const { deps } = page;
    handleAddParticleClick(deps, { _event: { detail: { groupId: "_root" } } });

    handleAddFormAddOptionClick(deps);
    expect(page.view().isCreateTagDialogOpen).toBe(true);
    await handleCreateTagFormAction(deps, {
      _event: { detail: { actionId: "submit", values: { name: "Night" } } },
    });

    const [{ tagId, scopeKey }] = deps.projectService.createTag.mock.calls[0];
    expect(scopeKey).toBe("particles");
    expect(deps.refs.addForm.setValues).toHaveBeenCalledWith({
      values: { tagIds: [tagId] },
    });
  });

  it("clears the selection from a resource background click", async () => {
    const page = await createPage();
    const { deps } = page;
    deps.store.setSelectedItemId({ itemId: "particle-1" });
    deps.refs.fileExplorer.clearSelection = vi.fn();

    handleResourceViewBackgroundClick(deps);

    expect(page.view().selectedItemId).toBeUndefined();
    expect(deps.refs.fileExplorer.clearSelection).toHaveBeenCalledOnce();
  });
});
