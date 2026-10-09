import { produce } from "immer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as animationEditorStore from "../../src/pages/animationEditor/animationEditor.store.js";
import {
  handleAddKeyframeFromTimeline,
  handleAddPropertySideMenuItemClick,
  handleAfterMount,
  handleConfirmMaskImageSelection,
  handleEditHistoryShortcutKeyDown,
  handleMaskImageSelected,
  handlePreviewImageClick,
  handleRedoButtonClick,
  handleSelectedKeyframeRelativeChange,
  handleSelectedKeyframeValueChange,
  handleUndoButtonClick,
} from "../../src/pages/animationEditor/animationEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";

// The page on its real store, opened on a saved animation, or on a new one
// with `payload`.
const createPage = async ({
  payload = { an: "animation-1" },
  keyframe = { relative: false },
} = {}) => {
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
                    ...keyframe,
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
      getPayload: () => payload,
      setPayload: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
      navigate: vi.fn(),
    },
    projectService: {
      ensureRepository: async () => {},
      getRepositoryState: () => repositoryState,
      updateAnimation: vi.fn(async () => ({ valid: true })),
      createAnimation: vi.fn(async () => ({ valid: true })),
    },
  };
  await handleAfterMount(deps);

  const keyframes = () => state.tweenBySection.update.x?.keyframes;
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

  it("keeps two quick keyframe adds on one track as two steps", async () => {
    const page = await createPage();
    for (const index of [1, 2]) {
      handleAddKeyframeFromTimeline(page.deps, {
        _event: { detail: { side: "update", property: "x", index } },
      });
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(page.keyframes()).toHaveLength(3);

    await handleUndoButtonClick(page.deps);
    expect(page.keyframes()).toHaveLength(2);
    await handleUndoButtonClick(page.deps);
    expect(page.keyframes()).toHaveLength(1);
  });

  it("records no step for an edit that changes nothing autosave saves", async () => {
    // Saving writes a missing relative as false, so setting it to false
    // changes only the page's own data.
    const page = await createPage({ keyframe: {} });
    page.store.setSelectedKeyframe({ side: "update", property: "x", index: 0 });

    handleSelectedKeyframeRelativeChange(page.deps, {
      _event: { detail: { value: false } },
    });

    expect(page.keyframes()[0].relative).toBe(false);
    expect(page.view().undoDisabled).toBe(true);
  });

  it("creates nothing when the first edit of a new animation is undone", async () => {
    const page = await createPage({ payload: { at: "update" } });
    await handleAddPropertySideMenuItemClick(page.deps, {
      _event: { detail: { item: { side: "update", value: "x" } } },
    });
    expect(page.keyframes()).toBeDefined();

    await handleUndoButtonClick(page.deps);
    expect(page.keyframes()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);

    expect(page.deps.projectService.createAnimation).not.toHaveBeenCalled();
  });

  // Picks a background preview image through its picker and OKs it.
  const pickBackground = async (page, imageId) => {
    handlePreviewImageClick(page.deps, {
      _event: {
        currentTarget: { dataset: { target: "preview-background" } },
      },
    });
    handleMaskImageSelected(page.deps, { _event: { detail: { imageId } } });
    await handleConfirmMaskImageSelection(page.deps);
  };

  it("saves a picked preview image of a saved animation on its own, once, outside the undo history", async () => {
    const page = await createPage();

    await pickBackground(page, "image-1");
    await vi.advanceTimersByTimeAsync(5000);

    const { updateAnimation } = page.deps.projectService;
    expect(updateAnimation).toHaveBeenCalledOnce();
    expect(updateAnimation.mock.calls[0][0]).toMatchObject({
      animationId: "animation-1",
      data: { preview: { background: { imageId: "image-1" } } },
    });
    expect(page.view().undoDisabled).toBe(true);

    // Saved, so an edit after it saves the animation without the images.
    page.store.setSelectedKeyframe({ side: "update", property: "x", index: 0 });
    page.typeValue(200);
    await vi.advanceTimersByTimeAsync(5000);
    expect(updateAnimation).toHaveBeenCalledTimes(2);
    expect(updateAnimation.mock.calls[1][0].data).not.toHaveProperty("preview");
  });

  it("creates a new animation on its first edit, not on a picked preview image, and takes the image along", async () => {
    const page = await createPage({ payload: { at: "update" } });
    const { createAnimation, updateAnimation } = page.deps.projectService;

    await pickBackground(page, "image-1");
    await vi.advanceTimersByTimeAsync(5000);
    expect(createAnimation).not.toHaveBeenCalled();

    await handleAddPropertySideMenuItemClick(page.deps, {
      _event: { detail: { item: { side: "update", value: "x" } } },
    });
    await vi.advanceTimersByTimeAsync(5000);

    expect(createAnimation).toHaveBeenCalledOnce();
    expect(createAnimation.mock.calls[0][0].data).toMatchObject({
      preview: { background: { imageId: "image-1" } },
    });
    // What it was created with is not saved again.
    await vi.advanceTimersByTimeAsync(5000);
    expect(updateAnimation).not.toHaveBeenCalled();
  });

  it("clears a keyframe selection the restore may point at a different keyframe", () => {
    const keyframe = (value) => ({
      duration: 500,
      value,
      easing: "linear",
      relative: false,
    });
    const snapshotWith = (keyframes) => ({
      tweenBySection: { update: { x: { initialValue: 0, keyframes } } },
      transitionMask: undefined,
      additionalTransitionMasks: [],
      cameraTracksAuthored: false,
    });
    let state = produce(animationEditorStore.createInitialState(), (draft) => {
      draft.tweenBySection.update.x = {
        initialValue: 0,
        keyframes: [keyframe(1), keyframe(2)],
      };
      draft.selectedKeyframe = { side: "update", property: "x", index: 1 };
    });
    const restore = (keyframes) =>
      produce(state, (draft) => {
        animationEditorStore.restoreAnimationHistorySnapshot(
          { state: draft },
          { snapshot: snapshotWith(keyframes) },
        );
      });

    // Only the selected keyframe's value changes: it stays selected.
    expect(restore([keyframe(1), keyframe(9)]).selectedKeyframe).toEqual({
      side: "update",
      property: "x",
      index: 1,
    });
    // The keyframes swap places: index 1 is now a different keyframe.
    expect(
      restore([keyframe(2), keyframe(1)]).selectedKeyframe,
    ).toBeUndefined();
  });

  it("turns undo and redo off while a video export runs", async () => {
    const page = await createPage();
    page.store.setSelectedKeyframe({ side: "update", property: "x", index: 0 });
    page.typeValue(500);
    expect(page.view().undoDisabled).toBe(false);

    page.store.setAnimationVideoExportInProgress({ inProgress: true });

    expect(page.view()).toMatchObject({
      undoDisabled: true,
      redoDisabled: true,
    });
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
