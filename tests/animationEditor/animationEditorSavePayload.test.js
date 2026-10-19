import { produce } from "immer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResourceCommandApi } from "../../src/deps/services/shared/commandApi/resources/index.js";
import {
  collectNonJsonFields,
  createCommandApiShared,
} from "../../src/deps/services/shared/commandApi/shared.js";
import {
  createProjectRepository,
  createRepositoryCommandEvent,
} from "../../src/deps/services/shared/projectRepository.js";
import * as animationEditorStore from "../../src/pages/animationEditor/animationEditor.store.js";
import {
  handleAddPropertySideMenuItemClick,
  handleAfterMount,
  handleConfirmMaskImageSelection,
  handleMaskImageSelected,
  handlePreviewImageClick,
  handlePropertyRemoveConfirmClick,
  handleSelectedKeyframeValueChange,
  handleSelectedPropertyDeleteClick,
} from "../../src/pages/animationEditor/animationEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";

// The animation editor on its real store and handlers, saving through the real
// command API into a real repository. A saved change is stored as JSON, which
// drops a field set to undefined, so a save must hold JSON values only.

const createRepositoryStore = () => ({
  appendEvents: vi.fn(async () => {}),
  loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
  saveMaterializedViewCheckpoint: vi.fn(async () => {}),
  deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
});

const setupProject = async () => {
  const repository = await createProjectRepository({
    projectId: "project-1",
    store: createRepositoryStore(),
    events: [],
    historyLoaded: true,
  });
  // The session stores each submitted command as JSON.
  const storedCommands = [];
  const store = (command) => {
    storedCommands.push(JSON.parse(JSON.stringify(command)));
    return command.id;
  };
  const session = {
    getActor: () => ({ userId: "user-1", clientId: "client-1" }),
    submitCommand: vi.fn(async (command) => store(command)),
    submitCommands: vi.fn(async (commands) => commands.map(store)),
  };
  const errorTracker = { capture: vi.fn() };
  let index = 0;
  const shared = createCommandApiShared({
    idGenerator: () => `id-${++index}`,
    now: () => 1,
    errorTracker,
    getCurrentProjectId: () => "project-1",
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => session,
    getOrCreateLocalActor: () => ({ userId: "user-1", clientId: "client-1" }),
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "s:test",
    resourceTypePartitionFor: () => "m",
  });

  return {
    errorTracker,
    repository,
    resources: createResourceCommandApi(shared),
    // The project as it loads again from what was stored.
    reload: () =>
      createProjectRepository({
        projectId: "project-1",
        store: createRepositoryStore(),
        events: storedCommands.map((command) =>
          createRepositoryCommandEvent({ command }),
        ),
        historyLoaded: true,
      }),
  };
};

// The editor opened on a saved animation, or on a new one with `payload`.
const openEditor = async ({ project, payload }) => {
  let state = animationEditorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (args) => {
        if (name.startsWith("select")) {
          return animationEditorStore[name]({ state }, args);
        }
        let result;
        state = produce(state, (draft) => {
          result = animationEditorStore[name]({ state: draft }, args);
        });
        return result;
      },
    },
  );
  const projectService = {
    ensureRepository: async () => {},
    getRepositoryState: () => project.repository.getState(),
    updateAnimation: vi.fn((args) => project.resources.updateAnimation(args)),
    createAnimation: vi.fn((args) => project.resources.createAnimation(args)),
  };
  const deps = {
    store,
    render: vi.fn(),
    refs: {},
    i18n: EN_I18N,
    appService: {
      getPayload: () => payload,
      setPayload: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
      navigate: vi.fn(),
    },
    projectService,
  };
  await handleAfterMount(deps);

  return {
    deps,
    store,
    // What each save sent, as the command API received it.
    savedData: () =>
      projectService.updateAnimation.mock.calls.map(([{ data }]) => data),
    createdData: () =>
      projectService.createAnimation.mock.calls.map(([{ data }]) => data),
    typeKeyframeValue: (value) => {
      store.setSelectedKeyframe({ side: "update", property: "x", index: 0 });
      handleSelectedKeyframeValueChange(deps, {
        _event: { detail: { value } },
      });
    },
    // Picks a background preview image through its picker and OKs it.
    pickBackground: async (imageId) => {
      handlePreviewImageClick(deps, {
        _event: {
          currentTarget: { dataset: { target: "preview-background" } },
        },
      });
      handleMaskImageSelected(deps, { _event: { detail: { imageId } } });
      await handleConfirmMaskImageSelection(deps);
    },
  };
};

const nonJsonFieldsOf = (data) => {
  const fields = new Set();
  collectNonJsonFields({ animationId: "animation-1", data }, "payload", fields);
  return [...fields];
};

const createSavedAnimation = (project, data = {}) =>
  project.resources.createAnimation({
    animationId: "animation-1",
    data: {
      type: "animation",
      name: "Animation One",
      description: "",
      animation: {
        type: "update",
        tween: {
          x: {
            initialValue: 0,
            keyframes: [{ duration: 1000, value: 100, easing: "linear" }],
          },
        },
      },
      ...data,
    },
  });

const savedAnimation = (repository) =>
  repository.getState().animations.items["animation-1"];

describe("animation editor save payload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves an animation that has no camera tracks without a cameraTracks field", async () => {
    const project = await setupProject();
    await createSavedAnimation(project);
    const editor = await openEditor({
      project,
      payload: { an: "animation-1" },
    });

    editor.typeKeyframeValue(250);
    await vi.advanceTimersByTimeAsync(5000);

    // A field set to undefined would be reported as a non-JSON value.
    expect(project.errorTracker.capture).not.toHaveBeenCalled();
    expect(editor.deps.projectService.updateAnimation).toHaveBeenCalledOnce();
    const [data] = editor.savedData();
    expect(Object.hasOwn(data, "cameraTracks")).toBe(false);
    expect(nonJsonFieldsOf(data)).toEqual([]);
    const saved = savedAnimation(project.repository);
    expect(saved.animation.tween.x.keyframes[0].value).toBe(250);
    expect(Object.hasOwn(saved, "cameraTracks")).toBe(false);
  });

  it("creates a new animation without a cameraTracks field, and saves its next edit without one", async () => {
    const project = await setupProject();
    const editor = await openEditor({ project, payload: { at: "update" } });

    await handleAddPropertySideMenuItemClick(editor.deps, {
      _event: { detail: { item: { side: "update", value: "x" } } },
    });
    await vi.advanceTimersByTimeAsync(5000);
    await handleAddPropertySideMenuItemClick(editor.deps, {
      _event: { detail: { item: { side: "update", value: "y" } } },
    });
    await vi.advanceTimersByTimeAsync(5000);

    expect(project.errorTracker.capture).not.toHaveBeenCalled();
    const [created] = editor.createdData();
    expect(Object.hasOwn(created, "cameraTracks")).toBe(false);
    expect(nonJsonFieldsOf(created)).toEqual([]);
    const [updated] = editor.savedData();
    expect(Object.hasOwn(updated, "cameraTracks")).toBe(false);
    expect(nonJsonFieldsOf(updated)).toEqual([]);
  });

  describe("an animation with a saved camera", () => {
    // A new animation with a camera on `side`, saved by the editor.
    const createCameraAnimation = async (project, { side = "update" } = {}) => {
      const creator = await openEditor({
        project,
        payload: { at: side === "update" ? "update" : "transition" },
      });
      await handleAddPropertySideMenuItemClick(creator.deps, {
        _event: { detail: { item: { side, value: "camera" } } },
      });
      await vi.advanceTimersByTimeAsync(5000);
      const [animationId] = Object.keys(
        project.repository.getState().animations.items,
      );
      expect(
        project.repository.getState().animations.items[animationId],
      ).toMatchObject({
        cameraTracks: [side],
      });
      return animationId;
    };

    it("saves the removal of its camera as an empty track list, which the project keeps after a load", async () => {
      const project = await setupProject();
      const animationId = await createCameraAnimation(project);
      const editor = await openEditor({
        project,
        payload: { an: animationId },
      });

      editor.store.setSelectedProperty({ side: "update", property: "camera" });
      handleSelectedPropertyDeleteClick(editor.deps);
      await vi.advanceTimersByTimeAsync(5000);

      expect(project.errorTracker.capture).not.toHaveBeenCalled();
      expect(editor.deps.projectService.updateAnimation).toHaveBeenCalledOnce();
      const [data] = editor.savedData();
      expect(data.cameraTracks).toEqual([]);
      expect(nonJsonFieldsOf(data)).toEqual([]);
      // The real reducers took the change: no tracks and no camera tween.
      const item = project.repository.getState().animations.items[animationId];
      expect(item.cameraTracks).toEqual([]);
      expect(item.animation).toEqual({ type: "update", tween: {} });
      const reloaded = await project.reload();
      expect(reloaded.getState().animations.items[animationId]).toEqual(item);
    });

    it("saves the removal of the camera of a transition the same way", async () => {
      const project = await setupProject();
      const animationId = await createCameraAnimation(project, {
        side: "prev",
      });
      const editor = await openEditor({
        project,
        payload: { an: animationId },
      });

      editor.store.setSelectedProperty({ side: "prev", property: "camera" });
      // A transition asks before it removes a track.
      handleSelectedPropertyDeleteClick(editor.deps);
      handlePropertyRemoveConfirmClick(editor.deps);
      await vi.advanceTimersByTimeAsync(5000);

      expect(project.errorTracker.capture).not.toHaveBeenCalled();
      const [data] = editor.savedData();
      expect(data.cameraTracks).toEqual([]);
      expect(nonJsonFieldsOf(data)).toEqual([]);
      const item = project.repository.getState().animations.items[animationId];
      expect(item.cameraTracks).toEqual([]);
      expect(item.animation.prev).toBeUndefined();
      const reloaded = await project.reload();
      expect(reloaded.getState().animations.items[animationId]).toEqual(item);
    });
  });

  describe("preview images", () => {
    it("saves no preview image field after a picker is confirmed with nothing picked", async () => {
      const project = await setupProject();
      await createSavedAnimation(project);
      const editor = await openEditor({
        project,
        payload: { an: "animation-1" },
      });

      await editor.pickBackground(undefined);
      editor.typeKeyframeValue(250);
      await vi.advanceTimersByTimeAsync(5000);

      expect(project.errorTracker.capture).not.toHaveBeenCalled();
      const [data] = editor.savedData();
      expect(nonJsonFieldsOf(data)).toEqual([]);
      expect(
        savedAnimation(project.repository).animation.tween.x.keyframes[0].value,
      ).toBe(250);
    });

    it("saves a picked preview image, and its clearing as a slot without an image", async () => {
      const project = await setupProject();
      await createSavedAnimation(project);
      const editor = await openEditor({
        project,
        payload: { an: "animation-1" },
      });

      await editor.pickBackground("image-1");
      await vi.advanceTimersByTimeAsync(5000);
      expect(savedAnimation(project.repository).preview).toEqual({
        background: { imageId: "image-1" },
        target: {},
      });

      await editor.pickBackground(undefined);
      await vi.advanceTimersByTimeAsync(5000);

      expect(project.errorTracker.capture).not.toHaveBeenCalled();
      expect(editor.savedData()).toHaveLength(2);
      for (const data of editor.savedData()) {
        expect(nonJsonFieldsOf(data)).toEqual([]);
      }
      expect(savedAnimation(project.repository).preview).toEqual({
        background: {},
        target: {},
      });
      const reloaded = await project.reload();
      expect(reloaded.getState().animations.items["animation-1"]).toEqual(
        savedAnimation(project.repository),
      );
    });
  });
});
