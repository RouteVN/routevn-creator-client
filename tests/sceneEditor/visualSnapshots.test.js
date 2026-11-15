import { produce } from "immer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sceneEditorStore from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import { captureSceneEditorVisualSnapshots } from "../../src/internal/ui/sceneEditor/runtime.js";
import { EN_I18N } from "../support/i18n.js";

// The page's store, as the page runs its actions and selectors.
const createStore = () => {
  let state = sceneEditorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return sceneEditorStore[name]({ state, i18n: EN_I18N }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = sceneEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  return { store, getState: () => state };
};

const visualContainer = (id, text) => ({
  id: `visual-${id}`,
  type: "container",
  x: 0,
  y: 0,
  children: [{ id: `${id}-text`, type: "text", content: text }],
});

describe("scene editor: pictures of the line's visuals", () => {
  let thumbnailCount;

  beforeEach(() => {
    thumbnailCount = 0;
    vi.stubGlobal("document", {
      createElement: () => ({
        getContext: () => ({ clearRect: vi.fn(), drawImage: vi.fn() }),
        toDataURL: () => {
          thumbnailCount += 1;
          return `data:image/png;base64,${thumbnailCount}`;
        },
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const createPage = ({ visualIds = ["one", "two"] } = {}) => {
    const { store, getState } = createStore();
    store.setPresentationState({
      presentationState: {
        visual: { items: visualIds.map((id) => ({ id, layer: 50 })) },
      },
    });
    const deps = {
      store,
      render: vi.fn(),
      graphicsService: {
        extractCanvas: vi.fn(async () => ({ width: 1920, height: 1080 })),
        engineSelectRenderState: vi.fn(),
      },
    };
    return { deps, store, getState };
  };

  const renderStateWith = (texts) => ({
    elements: [
      {
        id: "story",
        type: "container",
        children: Object.entries(texts).map(([id, text]) =>
          visualContainer(id, text),
        ),
      },
    ],
  });

  it("takes them only while the actions dialog is open", async () => {
    const { deps, store } = createPage();

    await captureSceneEditorVisualSnapshots(
      deps,
      renderStateWith({ one: "A", two: "B" }),
    );
    expect(deps.graphicsService.extractCanvas).not.toHaveBeenCalled();

    store.setActionTargetLineId({ lineId: "line-1" });
    await captureSceneEditorVisualSnapshots(
      deps,
      renderStateWith({ one: "A", two: "B" }),
    );
    // Each visual alone, by the element the engine draws it as.
    expect(deps.graphicsService.extractCanvas.mock.calls).toEqual([
      ["visual-one"],
      ["visual-two"],
    ]);
    expect(store.selectVisualSnapshots()).toEqual({
      one: expect.objectContaining({ url: "data:image/png;base64,1" }),
      two: expect.objectContaining({ url: "data:image/png;base64,2" }),
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });

  it("takes a visual's picture again only when it is drawn differently, and drops a visual that is gone", async () => {
    const { deps, store } = createPage();
    store.setActionTargetLineId({ lineId: "line-1" });
    await captureSceneEditorVisualSnapshots(
      deps,
      renderStateWith({ one: "A", two: "B" }),
    );
    deps.graphicsService.extractCanvas.mockClear();
    deps.render.mockClear();

    // Drawn the same: nothing is taken, and the page does not render.
    await captureSceneEditorVisualSnapshots(
      deps,
      renderStateWith({ one: "A", two: "B" }),
    );
    expect(deps.graphicsService.extractCanvas).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();

    // Visual two changed: only its picture is taken again.
    await captureSceneEditorVisualSnapshots(
      deps,
      renderStateWith({ one: "A", two: "C" }),
    );
    expect(deps.graphicsService.extractCanvas.mock.calls).toEqual([
      ["visual-two"],
    ]);
    expect(store.selectVisualSnapshots().one.url).toBe(
      "data:image/png;base64,1",
    );
    expect(store.selectVisualSnapshots().two.url).toBe(
      "data:image/png;base64,3",
    );

    // Visual two is no longer drawn.
    await captureSceneEditorVisualSnapshots(
      deps,
      renderStateWith({ one: "A" }),
    );
    expect(Object.keys(store.selectVisualSnapshots())).toEqual(["one"]);
  });

  it("takes them from what the engine last drew when it is given nothing, as when the dialog opens", async () => {
    const { deps, store } = createPage({ visualIds: ["one"] });
    store.setActionTargetLineId({ lineId: "line-1" });
    deps.graphicsService.engineSelectRenderState.mockReturnValue(
      renderStateWith({ one: "A" }),
    );

    await captureSceneEditorVisualSnapshots(deps);

    expect(deps.graphicsService.extractCanvas).toHaveBeenCalledWith(
      "visual-one",
    );
  });

  it("replaces a picture taken elsewhere once the canvas draws the visual", async () => {
    const { deps, store } = createPage({ visualIds: ["one"] });
    store.setActionTargetLineId({ lineId: "line-1" });
    store.setVisualSnapshot({
      visualId: "one",
      url: "data:image/png;base64,editor",
    });

    await captureSceneEditorVisualSnapshots(
      deps,
      renderStateWith({ one: "A" }),
    );

    expect(store.selectVisualSnapshots().one.url).toBe(
      "data:image/png;base64,1",
    );
  });

  it("leaves out a visual whose picture could not be taken", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, store } = createPage({ visualIds: ["one"] });
    store.setActionTargetLineId({ lineId: "line-1" });
    deps.graphicsService.extractCanvas.mockRejectedValueOnce(
      new Error("Element with label 'visual-one' not found"),
    );

    await captureSceneEditorVisualSnapshots(
      deps,
      renderStateWith({ one: "A" }),
    );

    expect(store.selectVisualSnapshots()).toEqual({});
  });

  it("gives the panel the pictures by visual id, and none to wait for without a canvas", () => {
    const { store } = createStore();
    store.setVisualSnapshot({
      visualId: "one",
      url: "data:image/png;base64,1",
    });

    expect(store.selectVisualSnapshotUrls()).toEqual({
      one: "data:image/png;base64,1",
    });

    store.setActionTargetLineId({ lineId: "line-1" });
    expect(store.selectShouldCaptureVisualSnapshots()).toBe(true);
    store.markCanvasUnavailable();
    expect(store.selectVisualSnapshotUrls()).toBeUndefined();
    expect(store.selectShouldCaptureVisualSnapshots()).toBe(false);
  });

  it("passes them to both of the page's actions panels", async () => {
    const { readFile } = await import("node:fs/promises");
    const view = await readFile(
      new URL(
        "../../src/pages/sceneEditorLexical/sceneEditorLexical.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const systemActionsLines = view
      .split("\n")
      .filter((line) => line.includes("rvn-system-actions#systemActions"));
    expect(systemActionsLines).toHaveLength(2);
    for (const line of systemActionsLines) {
      expect(line).toContain(":visualSnapshots=${visualSnapshots}");
    }
  });
});
