import { produce } from "immer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Subject from "../../src/deps/subject.js";
import * as editorStore from "../../src/components/visualLayoutEditor/visualLayoutEditor.store.js";
import {
  handleAfterMount,
  handleBeforeMount,
  handleCanvasDragUpdate,
  handleDoneClick,
  handleFileExplorerAction,
} from "../../src/components/visualLayoutEditor/visualLayoutEditor.handlers.js";
import {
  LAYOUT_EDITOR_SCENE_SLOT_ID,
  createLayoutEditorSceneBackdrop,
  placeLayoutInSceneBackdrop,
} from "../../src/internal/layoutEditorSceneBackdrop.js";
import { applyLayoutElementsCommand } from "../../src/internal/project/layout.js";
import { EN_I18N } from "../support/i18n.js";

const createElements = () => ({
  items: {
    frame: { type: "container", name: "Frame" },
    door: { type: "sprite", name: "Door", imageId: "door" },
    title: { type: "text", name: "Title", text: "Hello" },
  },
  tree: [{ id: "frame", children: [{ id: "door" }] }, { id: "title" }],
});

describe("applyLayoutElementsCommand", () => {
  it("adds an element at an index of its parent, leaving the given elements", () => {
    const elements = createElements();
    const next = applyLayoutElementsCommand(elements, {
      type: "create",
      elementId: "badge",
      data: { type: "text", name: "Badge", text: "New" },
      parentId: "frame",
      index: 0,
    });

    expect(next.items.badge).toEqual({
      type: "text",
      name: "Badge",
      text: "New",
    });
    expect(next.tree[0]).toEqual({
      id: "frame",
      children: [{ id: "badge" }, { id: "door" }],
    });
    expect(elements).toEqual(createElements());
  });

  it("updates, moves and deletes elements as layout commands do", () => {
    let elements = applyLayoutElementsCommand(createElements(), {
      type: "update",
      elementId: "title",
      data: { text: "Bye" },
      replace: false,
    });
    expect(elements.items.title).toEqual({
      type: "text",
      name: "Title",
      text: "Bye",
    });

    elements = applyLayoutElementsCommand(elements, {
      type: "move",
      elementId: "door",
      parentId: undefined,
      position: "first",
    });
    expect(elements.tree).toEqual([
      { id: "door" },
      { id: "frame" },
      { id: "title" },
    ]);

    elements = applyLayoutElementsCommand(elements, {
      type: "delete",
      elementIds: ["frame", "title"],
    });
    expect(elements).toEqual({
      items: { door: { type: "sprite", name: "Door", imageId: "door" } },
      tree: [{ id: "door" }],
    });
  });

  it("deletes a container with its elements", () => {
    const next = applyLayoutElementsCommand(createElements(), {
      type: "delete",
      elementIds: ["frame"],
    });

    expect(Object.keys(next.items)).toEqual(["title"]);
  });

  it("changes nothing for an element that is not there", () => {
    expect(
      applyLayoutElementsCommand(createElements(), {
        type: "update",
        elementId: "missing",
        data: { text: "Bye" },
      }),
    ).toBeUndefined();
    expect(
      applyLayoutElementsCommand(createElements(), {
        type: "move",
        elementId: "missing",
        position: "first",
      }),
    ).toBeUndefined();
  });
});

describe("the scene backdrop of a visual's layout", () => {
  const renderedScene = [
    { id: "bg", type: "sprite", src: "bg.png", click: { actions: {} } },
    {
      id: "visual-card",
      type: "container",
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
      width: 300,
      height: 200,
      alpha: 0.5,
      children: [{ id: "visual-card--old", type: "rect" }],
    },
    {
      id: "dialogue",
      type: "container",
      hover: { cursor: "pointer" },
      children: [{ id: "line", type: "text", click: { actions: {} } }],
    },
  ];

  it("keeps the scene in order, shown only, with the visual's place as the slot", () => {
    const backdrop = createLayoutEditorSceneBackdrop(renderedScene, {
      replacedElementId: "visual-card",
    });

    expect(backdrop.map((element) => element.id)).toEqual([
      "bg",
      LAYOUT_EDITOR_SCENE_SLOT_ID,
      "dialogue",
    ]);
    expect(backdrop[0]).toEqual({ id: "bg", type: "sprite", src: "bg.png" });
    expect(backdrop[1]).toEqual({
      id: LAYOUT_EDITOR_SCENE_SLOT_ID,
      type: "container",
      x: 960,
      y: 540,
      anchorX: 0.5,
      anchorY: 0.5,
      width: 300,
      height: 200,
    });
    expect(backdrop[2]).toEqual({
      id: "dialogue",
      type: "container",
      children: [{ id: "line", type: "text" }],
    });
    expect(renderedScene[0].click).toBeDefined();
  });

  it("puts the slot above the scene when the visual is not drawn", () => {
    const backdrop = createLayoutEditorSceneBackdrop(renderedScene, {
      replacedElementId: "visual-other",
    });

    expect(backdrop.at(-1)).toEqual({
      id: LAYOUT_EDITOR_SCENE_SLOT_ID,
      type: "container",
      x: 0,
      y: 0,
    });
    expect(createLayoutEditorSceneBackdrop(undefined)).toEqual([
      { id: LAYOUT_EDITOR_SCENE_SLOT_ID, type: "container", x: 0, y: 0 },
    ]);
  });

  it("draws the layout's elements in the slot, or alone without a scene", () => {
    const layoutElements = [{ id: "badge", type: "rect" }];
    const backdrop = createLayoutEditorSceneBackdrop(renderedScene, {
      replacedElementId: "visual-card",
    });

    expect(placeLayoutInSceneBackdrop(backdrop, layoutElements)[1]).toEqual({
      ...backdrop[1],
      children: layoutElements,
    });
    expect(placeLayoutInSceneBackdrop(undefined, layoutElements)).toBe(
      layoutElements,
    );
    expect(placeLayoutInSceneBackdrop([], layoutElements)).toBe(layoutElements);
  });
});

const createRepositoryState = () => ({
  project: { resolution: { width: 1920, height: 1080 } },
  images: {
    items: { door: { id: "door", type: "image", width: 320, height: 160 } },
    tree: [{ id: "door" }],
  },
  scenes: {
    items: {
      "scene-1": {
        sections: {
          items: {
            "section-1": {
              lines: {
                items: {
                  "line-1": {
                    actions: {
                      visual: {
                        items: [
                          {
                            id: "card",
                            layout: {
                              layoutSchemaVersion: 2,
                              elements: createElements(),
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

// The editor on its real store, over a project whose saves are given.
const createEditor = ({ updateVisualLayoutElements } = {}) => {
  let state = editorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return editorStore[name]({ state }, payload);
        }
        state = produce(state, (draft) => {
          editorStore[name]({ state: draft }, payload);
        });
      },
    },
  );
  const repositoryState = createRepositoryState();
  const deps = {
    store,
    subject: new Subject(),
    i18n: EN_I18N,
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    props: {
      sceneId: "scene-1",
      sectionId: "section-1",
      lineId: "line-1",
      visualId: "card",
    },
    refs: {
      fileExplorer: { selectItem: vi.fn() },
      layoutEditPanel: { setTransientValues: vi.fn() },
      layoutEditorCanvas: { discardPendingUpdate: vi.fn() },
    },
    uiConfig: {},
    appService: {
      reportError: vi.fn(),
      showAlert: vi.fn(),
      showAlertWhenIdle: vi.fn(),
      showComponentDialog: vi.fn(),
    },
    projectService: {
      getRepositoryState: vi.fn(() => repositoryState),
      updateVisualLayoutElements:
        updateVisualLayoutElements ?? vi.fn(async () => ({ valid: true })),
    },
  };
  const cleanup = handleBeforeMount(deps);
  handleAfterMount(deps);
  return { cleanup, deps, store };
};

const rename = (deps, itemId, newName) =>
  handleFileExplorerAction(deps, {
    _event: {
      detail: { value: "rename-item-confirmed", itemId, newName },
    },
  });

describe("the layout editor of a visual", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the visual's layout from its line", () => {
    const { store } = createEditor();

    expect(store.selectIsMissing()).toBe(false);
    expect(store.selectLayoutElements()).toEqual(createElements());
    expect(store.selectProjectResolution()).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("does not open a layout built for the engine, and says so", () => {
    const repositoryState = createRepositoryState();
    repositoryState.scenes.items["scene-1"].sections.items[
      "section-1"
    ].lines.items["line-1"].actions.visual.items[0].layout = {
      elements: [{ id: "content", type: "sprite", imageId: "door" }],
    };
    const props = {
      sceneId: "scene-1",
      sectionId: "section-1",
      lineId: "line-1",
      visualId: "card",
    };
    const state = produce(editorStore.createInitialState(), (draft) => {
      editorStore.loadVisualLayout(
        { state: draft },
        { repositoryState, ...props },
      );
    });

    expect(editorStore.selectIsMissing({ state })).toBe(true);
    expect(editorStore.selectLayoutElements({ state })).toEqual({
      items: {},
      tree: [],
    });
    expect(
      editorStore.selectViewData({ state, props, i18n: EN_I18N }),
    ).toMatchObject({
      isMissing: true,
      cannotEditLabel: EN_I18N.visualLayoutEditor.cannotEditLayout,
    });
  });

  it("saves the whole layout once edits pause", async () => {
    const { deps } = createEditor();
    const { updateVisualLayoutElements } = deps.projectService;

    await rename(deps, "title", "Heading");
    await vi.advanceTimersByTimeAsync(200);
    await rename(deps, "door", "Gate");
    await vi.advanceTimersByTimeAsync(200);
    expect(updateVisualLayoutElements).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(updateVisualLayoutElements).toHaveBeenCalledTimes(1);
    const [{ lineId, visualId, elements }] =
      updateVisualLayoutElements.mock.calls[0];
    expect({ lineId, visualId }).toEqual({
      lineId: "line-1",
      visualId: "card",
    });
    expect(elements.items.title.name).toBe("Heading");
    expect(elements.items.door.name).toBe("Gate");
  });

  it("saves edits made during a save after it, never two at once", async () => {
    let finishFirstSave;
    let running = 0;
    let mostRunning = 0;
    const updateVisualLayoutElements = vi.fn(async () => {
      running += 1;
      mostRunning = Math.max(mostRunning, running);
      if (updateVisualLayoutElements.mock.calls.length === 1) {
        await new Promise((resolve) => {
          finishFirstSave = resolve;
        });
      }
      running -= 1;
      return { valid: true };
    });
    const { deps } = createEditor({ updateVisualLayoutElements });

    await rename(deps, "title", "Heading");
    await vi.advanceTimersByTimeAsync(400);
    await rename(deps, "door", "Gate");
    await vi.advanceTimersByTimeAsync(400);
    expect(updateVisualLayoutElements).toHaveBeenCalledTimes(1);

    finishFirstSave();
    await vi.advanceTimersByTimeAsync(0);
    expect(updateVisualLayoutElements).toHaveBeenCalledTimes(2);
    expect(
      updateVisualLayoutElements.mock.calls[1][0].elements.items.door.name,
    ).toBe("Gate");
    expect(mostRunning).toBe(1);
  });

  it("keeps a drag on the canvas and in the panel without drawing again", async () => {
    const { deps, store } = createEditor();
    deps.render.mockClear();

    handleCanvasDragUpdate(deps, {
      _event: {
        detail: {
          itemId: "door",
          updatedItem: { ...createElements().items.door, x: 40, y: 20 },
        },
      },
    });

    expect(store.selectItemById({ itemId: "door" })).toMatchObject({
      x: 40,
      y: 20,
    });
    expect(deps.refs.layoutEditPanel.setTransientValues).toHaveBeenCalledWith({
      values: { x: 40, y: 20 },
    });
    expect(deps.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(deps.projectService.updateVisualLayoutElements).toHaveBeenCalled();
  });

  it("saves what is left on Done, then closes", async () => {
    const { deps } = createEditor();

    await rename(deps, "title", "Heading");
    handleDoneClick(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(
      deps.projectService.updateVisualLayoutElements,
    ).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");

    // The save waiting for a pause has nothing left to save.
    await vi.advanceTimersByTimeAsync(400);
    expect(
      deps.projectService.updateVisualLayoutElements,
    ).toHaveBeenCalledTimes(1);
  });

  it("sends a picture of the layout alone with Done, taken from the canvas before it goes", async () => {
    const thumbnailCanvas = {
      getContext: () => ({ clearRect: vi.fn(), drawImage: vi.fn() }),
      toDataURL: vi.fn(() => "data:image/png;base64,bGF5b3V0"),
    };
    vi.stubGlobal("document", { createElement: () => thumbnailCanvas });
    const { deps } = createEditor();
    deps.props.sceneBackdrop = [{ id: "layout-editor-scene-slot" }];
    deps.graphicsService = {
      extractCanvas: vi.fn(async () => ({ width: 1920, height: 1080 })),
    };

    handleDoneClick(deps);
    await vi.advanceTimersByTimeAsync(0);

    // The layout is drawn in the scene's slot: the picture is of the slot.
    expect(deps.graphicsService.extractCanvas).toHaveBeenCalledWith(
      "layout-editor-scene-slot",
    );
    expect(thumbnailCanvas.toDataURL).toHaveBeenCalledWith("image/png", 0.75);
    const [closeEvent] = deps.dispatchEvent.mock.calls[0];
    expect(closeEvent.type).toBe("close");
    expect(closeEvent.detail).toEqual({
      snapshotUrl: "data:image/png;base64,bGF5b3V0",
    });
    vi.unstubAllGlobals();
  });

  it("closes without a picture when it has no scene to take it from, or taking it fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const withoutScene = createEditor().deps;
    withoutScene.graphicsService = { extractCanvas: vi.fn() };
    handleDoneClick(withoutScene);
    await vi.advanceTimersByTimeAsync(0);
    expect(withoutScene.graphicsService.extractCanvas).not.toHaveBeenCalled();
    expect(withoutScene.dispatchEvent.mock.calls[0][0].detail).toEqual({
      snapshotUrl: undefined,
    });

    const failing = createEditor().deps;
    failing.props.sceneBackdrop = [{ id: "layout-editor-scene-slot" }];
    failing.graphicsService = {
      extractCanvas: vi.fn(async () => {
        throw new Error(
          "Element with label 'layout-editor-scene-slot' not found",
        );
      }),
    };
    handleDoneClick(failing);
    await vi.advanceTimersByTimeAsync(0);
    expect(failing.dispatchEvent.mock.calls[0][0].detail).toEqual({
      snapshotUrl: undefined,
    });
  });

  it("stays open after a failed save, back on the saved layout, and tells the user", async () => {
    const updateVisualLayoutElements = vi.fn(async () => ({
      valid: false,
      error: { code: "visual_layout_missing", message: "Gone." },
    }));
    const { deps, store } = createEditor({ updateVisualLayoutElements });

    await rename(deps, "title", "Heading");
    handleDoneClick(deps);
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.dispatchEvent).not.toHaveBeenCalled();
    expect(store.selectItemById({ itemId: "title" }).name).toBe("Title");
    expect(store.selectHasUnsavedEdits()).toBe(false);
    expect(
      deps.refs.layoutEditorCanvas.discardPendingUpdate,
    ).toHaveBeenCalled();
    expect(deps.appService.showAlertWhenIdle).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          EN_I18N.visualLayoutEditor.failedSaveChanges,
        ),
      }),
    );
  });

  it("saves what is left when it closes some other way", async () => {
    const { cleanup, deps } = createEditor();

    await rename(deps, "title", "Heading");
    await cleanup();

    expect(
      deps.projectService.updateVisualLayoutElements,
    ).toHaveBeenCalledTimes(1);
  });

  it("adds a sprite from the image chosen, at its size, and selects it", async () => {
    const { deps, store } = createEditor();
    deps.appService.showComponentDialog = vi.fn(async () => ({
      actionId: "create",
      values: { name: "Door Two", imageId: "door" },
    }));

    await handleFileExplorerAction(deps, {
      _event: {
        detail: {
          itemId: "frame",
          item: { value: { action: "new-child-item", type: "sprite" } },
        },
      },
    });

    const selectedId = store.selectSelectedItemId();
    expect(store.selectItemById({ itemId: selectedId })).toMatchObject({
      type: "sprite",
      name: "Door Two",
      imageId: "door",
      width: 320,
      height: 160,
      aspectRatioLock: 2,
    });
    expect(store.selectLayoutElements().tree[0].children[0]).toEqual({
      id: selectedId,
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: selectedId,
    });
  });

  it("forgets the selection of an element deleted with its container", async () => {
    const { deps, store } = createEditor();
    store.setSelectedItemId({ itemId: "door" });

    await handleFileExplorerAction(deps, {
      _event: { detail: { value: "delete-item", itemId: "frame" } },
    });

    expect(store.selectSelectedItemId()).toBeUndefined();
    expect(store.selectItemById({ itemId: "door" })).toBeUndefined();
  });
});
