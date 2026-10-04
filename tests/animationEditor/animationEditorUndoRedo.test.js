import { produce } from "immer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as animationEditorStore from "../../src/pages/animationEditor/animationEditor.store.js";
import {
  handleAddKeyframeFromTimeline,
  handleAfterMount,
  handleEditHistoryShortcutKeyDown,
  handleRedoButtonClick,
  handleSelectedKeyframeValueChange,
  handleUndoButtonClick,
} from "../../src/pages/animationEditor/animationEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";

// The page on its real store, opened on a saved animation.
const createPage = async () => {
  let state = animationEditorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return animationEditorStore[name]({ state }, payload);
        }
        let result;
        state = produce(state, (draft) => {
          result = animationEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  const repositoryState = {
    project: { resolution: { width: 1920, height: 1080 } },
    images: { items: {}, tree: [] },
    animations: {
      tree: [{ id: "animation-1" }],
      items: {
        "animation-1": {
          id: "animation-1",
          type: "animation",
          name: "Animation One",
          description: "",
          animation: {
            type: "update",
            tween: {
              x: {
                initialValue: 0,
                keyframes: [
                  {
                    duration: 1000,
                    value: 100,
                    easing: "linear",
                    relative: false,
                  },
                ],
              },
            },
          },
        },
      },
    },
  };
  const deps = {
    store,
    render: vi.fn(),
    refs: {},
    i18n: EN_I18N,
    appService: {
      getPayload: () => ({ an: "animation-1" }),
      showAlert: vi.fn(),
      showToast: vi.fn(),
      navigate: vi.fn(),
    },
    projectService: {
      ensureRepository: async () => {},
      getRepositoryState: () => repositoryState,
      updateAnimation: vi.fn(async () => ({ valid: true })),
    },
  };
  await handleAfterMount(deps);

  const keyframes = () => state.tweenBySection.update.x.keyframes;
  const view = () =>
    animationEditorStore.selectViewData({ state, i18n: EN_I18N });
  const typeValue = (value) =>
    handleSelectedKeyframeValueChange(deps, {
      _event: { detail: { value } },
    });
  const savedValues = () =>
    deps.projectService.updateAnimation.mock.calls.map(
      ([{ data }]) => data.animation.tween.x.keyframes[0].value,
    );
  return { deps, store, keyframes, view, typeValue, savedValues };
};

const shortcut = (init) => ({
  metaKey: true,
  key: "z",
  code: "KeyZ",
  composedPath: () => [],
  preventDefault: vi.fn(),
  ...init,
});

describe("animation editor undo and redo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("undoes a value typed in several keystrokes as one step, and saves nothing for it", async () => {
    const page = await createPage();
    expect(page.view()).toMatchObject({
      undoDisabled: true,
      redoDisabled: true,
      undoLabel: "Undo",
    });
    page.store.setSelectedKeyframe({ side: "update", property: "x", index: 0 });

    for (const value of [1, 12, 120]) {
      page.typeValue(value);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(page.keyframes()[0].value).toBe(120);

    await handleUndoButtonClick(page.deps);
    expect(page.keyframes()[0].value).toBe(100);
    expect(page.view()).toMatchObject({
      undoDisabled: true,
      redoDisabled: false,
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(page.savedValues()).toEqual([]);

    await handleRedoButtonClick(page.deps);
    expect(page.keyframes()[0].value).toBe(120);
    await vi.advanceTimersByTimeAsync(5000);
    expect(page.savedValues()).toEqual([120]);
  });

  it("keeps separate edits as separate steps", async () => {
    const page = await createPage();
    page.store.setSelectedKeyframe({ side: "update", property: "x", index: 0 });
    page.typeValue(200);
    await vi.advanceTimersByTimeAsync(2000);
    page.typeValue(300);

    await handleUndoButtonClick(page.deps);
    expect(page.keyframes()[0].value).toBe(200);
    await handleUndoButtonClick(page.deps);
    expect(page.keyframes()[0].value).toBe(100);
  });

  it("undoes an added keyframe and clears the selection on it", async () => {
    const page = await createPage();
    handleAddKeyframeFromTimeline(page.deps, {
      _event: { detail: { side: "update", property: "x", index: 1 } },
    });
    expect(page.keyframes()).toHaveLength(2);
    expect(page.store.selectSelectedKeyframe()).toMatchObject({ index: 1 });

    await handleUndoButtonClick(page.deps);

    expect(page.keyframes()).toHaveLength(1);
    expect(page.store.selectSelectedKeyframe()).toBeUndefined();
    await handleRedoButtonClick(page.deps);
    expect(page.keyframes()).toHaveLength(2);
  });

  it("undoes and redoes with the keyboard, but not in a field or during a video export", async () => {
    const page = await createPage();
    page.store.setSelectedKeyframe({ side: "update", property: "x", index: 0 });
    page.typeValue(500);

    const inField = shortcut({ composedPath: () => [{ tagName: "INPUT" }] });
    handleEditHistoryShortcutKeyDown(page.deps, { _event: inField });
    expect(inField.preventDefault).not.toHaveBeenCalled();
    expect(page.keyframes()[0].value).toBe(500);

    page.store.setAnimationVideoExportInProgress({ inProgress: true });
    handleEditHistoryShortcutKeyDown(page.deps, { _event: shortcut() });
    await vi.advanceTimersByTimeAsync(0);
    expect(page.keyframes()[0].value).toBe(500);
    page.store.setAnimationVideoExportInProgress({ inProgress: false });

    const undo = shortcut();
    handleEditHistoryShortcutKeyDown(page.deps, { _event: undo });
    await vi.advanceTimersByTimeAsync(0);
    expect(undo.preventDefault).toHaveBeenCalled();
    expect(page.keyframes()[0].value).toBe(100);

    handleEditHistoryShortcutKeyDown(page.deps, {
      _event: shortcut({ shiftKey: true }),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(page.keyframes()[0].value).toBe(500);
  });
});
