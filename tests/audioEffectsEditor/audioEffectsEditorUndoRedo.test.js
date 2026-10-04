import { produce } from "immer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as audioEffectsEditorStore from "../../src/pages/audioEffectsEditor/audioEffectsEditor.store.js";
import {
  handleAddKeyframeFromTimeline,
  handleAfterMount,
  handleBackClick,
  handleBeforeMount,
  handleEditHistoryShortcutKeyDown,
  handleKeyframeDropdownItemClick,
  handleKeyframeDurationChange,
  handleRedoButtonClick,
  handleRemovePropertyClick,
  handleSavePreviewClick,
  handleSelectedKeyframeEasingChange,
  handleSelectedKeyframeValueChange,
  handleUndoButtonClick,
} from "../../src/pages/audioEffectsEditor/audioEffectsEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";

const keyframe = (value, duration = 1000) => ({
  value,
  duration,
  easing: "linear",
});

const updateEffect = {
  type: "update",
  tween: {
    volume: { keyframes: [keyframe(50), keyframe(80, 500)] },
  },
};

const transitionEffect = {
  type: "transition",
  prev: { volume: { keyframes: [keyframe(0)] } },
  next: {
    volume: { initialValue: 0, keyframes: [keyframe(100)] },
    pan: { keyframes: [keyframe(0)] },
  },
};

// The page on its real store, opened on a saved audio effect.
const createPage = async ({ audioEffect = updateEffect } = {}) => {
  let state = audioEffectsEditorStore.createInitialState();
  const store = new Proxy(
    {},
    {
      get: (_target, name) => (payload) => {
        if (name.startsWith("select")) {
          return audioEffectsEditorStore[name](
            { state, i18n: EN_I18N },
            payload,
          );
        }
        let result;
        state = produce(state, (draft) => {
          result = audioEffectsEditorStore[name]({ state: draft }, payload);
        });
        return result;
      },
    },
  );
  const repositoryState = {
    sounds: { items: {}, tree: [] },
    audioEffects: {
      tree: [{ id: "effect-1" }],
      items: {
        "effect-1": {
          id: "effect-1",
          type: "audioEffect",
          name: "Effect One",
          audioEffect,
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
      getPayload: () => ({ aef: "effect-1" }),
      navigate: vi.fn(),
      showAlert: vi.fn(),
      showToast: vi.fn(),
    },
    projectService: {
      ensureRepository: async () => {},
      getRepositoryState: () => repositoryState,
      updateAudioEffect: vi.fn(async () => ({ valid: true })),
    },
  };
  await handleAfterMount(deps);

  const definition = () => state.definition;
  const keyframes = () => state.definition.tween.volume.keyframes;
  const view = () =>
    audioEffectsEditorStore.selectViewData({ state, i18n: EN_I18N });
  const typeValue = (value) =>
    handleSelectedKeyframeValueChange(deps, {
      _event: { detail: { value } },
    });
  const savedEffects = () =>
    deps.projectService.updateAudioEffect.mock.calls
      .map(([{ data }]) => data.audioEffect)
      .filter(Boolean);
  return { deps, store, definition, keyframes, view, typeValue, savedEffects };
};

const shortcut = (init) => ({
  metaKey: true,
  key: "z",
  code: "KeyZ",
  composedPath: () => [],
  preventDefault: vi.fn(),
  ...init,
});

describe("audio effects editor undo and redo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("undoes a value dragged in several steps as one step, and saves nothing for it", async () => {
    const page = await createPage();
    expect(page.view()).toMatchObject({
      undoDisabled: true,
      redoDisabled: true,
      undoLabel: "Undo",
      redoLabel: "Redo",
    });
    page.store.setSelectedKeyframe({
      side: "update",
      property: "volume",
      index: 0,
    });

    for (const value of [55, 60, 65]) {
      page.typeValue(value);
      vi.advanceTimersByTime(100);
    }
    expect(page.keyframes()[0].value).toBe(65);

    handleUndoButtonClick(page.deps);
    expect(page.keyframes()[0].value).toBe(50);
    expect(page.view()).toMatchObject({
      undoDisabled: true,
      redoDisabled: false,
    });
    expect(page.store.selectSelectedKeyframe()).toMatchObject({ index: 0 });
    await handleBackClick(page.deps);
    expect(page.savedEffects()).toEqual([]);

    handleRedoButtonClick(page.deps);
    expect(page.keyframes()[0].value).toBe(65);
    await handleBackClick(page.deps);
    expect(
      page
        .savedEffects()
        .map((effect) => effect.tween.volume.keyframes[0].value),
    ).toEqual([65]);
  });

  it("keeps separate edits as separate steps", async () => {
    const page = await createPage();
    page.store.setSelectedKeyframe({
      side: "update",
      property: "volume",
      index: 0,
    });
    page.typeValue(60);
    vi.advanceTimersByTime(2000);
    page.typeValue(70);

    handleUndoButtonClick(page.deps);
    expect(page.keyframes()[0].value).toBe(60);
    handleUndoButtonClick(page.deps);
    expect(page.keyframes()[0].value).toBe(50);
  });

  it("records no step for an edit that changes nothing", async () => {
    const page = await createPage();
    page.store.setSelectedKeyframe({
      side: "update",
      property: "volume",
      index: 0,
    });

    handleSelectedKeyframeEasingChange(page.deps, {
      _event: { detail: { value: "linear" } },
    });

    expect(page.view().undoDisabled).toBe(true);
    expect(page.store.selectDirty()).toBe(false);
  });

  it("undoes an added keyframe and clears the selection on it", async () => {
    const page = await createPage();
    handleAddKeyframeFromTimeline(page.deps, {
      _event: {
        detail: { side: "update", property: "volume", index: 1, duration: 300 },
      },
    });
    expect(page.keyframes()).toHaveLength(3);
    expect(page.store.selectSelectedKeyframe()).toMatchObject({ index: 1 });

    handleUndoButtonClick(page.deps);

    expect(page.keyframes()).toHaveLength(2);
    expect(page.store.selectSelectedKeyframe()).toBeUndefined();
    handleRedoButtonClick(page.deps);
    expect(page.keyframes()).toHaveLength(3);
  });

  it("keeps two quick keyframe adds on one track as two steps", async () => {
    const page = await createPage();
    for (const index of [1, 2]) {
      handleAddKeyframeFromTimeline(page.deps, {
        _event: { detail: { side: "update", property: "volume", index } },
      });
      vi.advanceTimersByTime(300);
    }
    expect(page.keyframes()).toHaveLength(4);

    handleUndoButtonClick(page.deps);
    expect(page.keyframes()).toHaveLength(3);
    handleUndoButtonClick(page.deps);
    expect(page.keyframes()).toHaveLength(2);
  });

  it("brings back a deleted keyframe, and closes the keyframe menu", async () => {
    const page = await createPage();
    page.store.openKeyframeMenu({
      side: "update",
      property: "volume",
      index: 0,
      x: 10,
      y: 20,
    });
    handleKeyframeDropdownItemClick(page.deps, {
      _event: { detail: { item: { value: "delete-keyframe" } } },
    });
    expect(page.keyframes()).toEqual([keyframe(80, 500)]);

    page.store.openKeyframeMenu({
      side: "update",
      property: "volume",
      index: 0,
      x: 10,
      y: 20,
    });
    handleUndoButtonClick(page.deps);

    expect(page.keyframes()).toEqual(updateEffect.tween.volume.keyframes);
    expect(page.store.selectKeyframeMenu().open).toBe(false);
  });

  it("brings back a removed transition property and drops the selection on it on redo", async () => {
    const page = await createPage({ audioEffect: transitionEffect });
    page.store.setSelectedProperty({ side: "next", property: "pan" });
    handleRemovePropertyClick(page.deps);
    expect(page.definition().next.pan).toBeUndefined();

    handleUndoButtonClick(page.deps);
    expect(page.definition()).toEqual(transitionEffect);

    page.store.setSelectedProperty({ side: "next", property: "pan" });
    handleRedoButtonClick(page.deps);
    expect(page.definition().next.pan).toBeUndefined();
    expect(page.store.selectSelectedProperty()).toBeUndefined();
  });

  it("clears a keyframe selection the restore may point at a different keyframe", () => {
    const definition = (keyframes) => ({
      type: "update",
      tween: { volume: { keyframes } },
    });
    // Opens on `restored`, edits it to `current` with keyframe `index`
    // selected, and undoes that edit.
    const undoSelection = ({ restored, current, index }) => {
      let state = produce(
        audioEffectsEditorStore.createInitialState(),
        (draft) => {
          audioEffectsEditorStore.loadAudioEffect(
            { state: draft },
            { item: { id: "effect-1", audioEffect: definition(restored) } },
          );
        },
      );
      state = produce(state, (draft) => {
        draft.definition = definition(current);
        audioEffectsEditorStore.recordAudioEffectEdit(
          { state: draft },
          { definition: definition(current), time: 0 },
        );
        draft.selectedKeyframe = { side: "update", property: "volume", index };
      });
      return produce(state, (draft) => {
        audioEffectsEditorStore.applyEditHistoryStep(
          { state: draft },
          { direction: "undo" },
        );
      }).selectedKeyframe;
    };

    // Only the selected keyframe's value changes: it stays selected.
    expect(
      undoSelection({
        restored: [keyframe(1), keyframe(9)],
        current: [keyframe(1), keyframe(2)],
        index: 1,
      }),
    ).toMatchObject({ index: 1 });
    // The keyframes swap places: index 1 is now a different keyframe.
    expect(
      undoSelection({
        restored: [keyframe(2), keyframe(1)],
        current: [keyframe(1), keyframe(2)],
        index: 1,
      }),
    ).toBeUndefined();
    // The keyframe before it changes: index 0 is no longer the same one.
    expect(
      undoSelection({
        restored: [keyframe(1), { ...keyframe(2), delay: 100 }],
        current: [{ ...keyframe(1), delay: 100 }, keyframe(2)],
        index: 1,
      }),
    ).toBeUndefined();
  });

  it("keeps the selection when a timeline move of the keyframe is undone", async () => {
    const page = await createPage();
    // Moving the keyframe also moves the gap before the next one.
    handleKeyframeDurationChange(page.deps, {
      _event: {
        detail: {
          side: "update",
          property: "volume",
          index: 0,
          delay: 200,
          duration: 800,
          followingDelay: 100,
        },
      },
    });
    expect(page.keyframes()[1].delay).toBe(100);

    handleUndoButtonClick(page.deps);

    expect(page.keyframes()).toEqual(updateEffect.tween.volume.keyframes);
    expect(page.store.selectSelectedKeyframe()).toMatchObject({ index: 0 });
  });

  it("saves nothing for a value changed and changed back", async () => {
    const page = await createPage();
    page.store.setSelectedKeyframe({
      side: "update",
      property: "volume",
      index: 0,
    });
    page.typeValue(60);
    page.typeValue(50);

    expect(page.view().undoDisabled).toBe(true);
    expect(page.store.selectDirty()).toBe(false);
    await handleBackClick(page.deps);
    expect(page.savedEffects()).toEqual([]);
  });

  it("still saves an undo back to the saved version made while a save runs", async () => {
    const page = await createPage();
    page.store.setSelectedKeyframe({
      side: "update",
      property: "volume",
      index: 0,
    });
    page.typeValue(60);
    let finishSave;
    page.deps.projectService.updateAudioEffect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = () => resolve({ valid: true });
        }),
    );
    const savingPreview = handleSavePreviewClick(page.deps);

    // The save of 60 is still running, so 50 is not saved yet.
    handleUndoButtonClick(page.deps);
    expect(page.store.selectDirty()).toBe(true);
    await handleBackClick(page.deps);
    finishSave();
    await savingPreview;

    expect(
      page
        .savedEffects()
        .map((effect) => effect.tween.volume.keyframes[0].value),
    ).toEqual([60, 50]);
  });

  it("saves an undo made after a save, and one made while the save ran", async () => {
    const page = await createPage();
    page.store.setSelectedKeyframe({
      side: "update",
      property: "volume",
      index: 0,
    });
    page.typeValue(60);
    await handleSavePreviewClick(page.deps);
    expect(page.store.selectDirty()).toBe(false);

    handleUndoButtonClick(page.deps);
    expect(page.store.selectDirty()).toBe(true);

    let finishSave;
    page.deps.projectService.updateAudioEffect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = () => resolve({ valid: true });
        }),
    );
    const saving = handleBackClick(page.deps);
    // Redo while the save of the undo is still running.
    handleRedoButtonClick(page.deps);
    finishSave();
    await saving;

    expect(page.keyframes()[0].value).toBe(60);
    expect(page.store.selectDirty()).toBe(true);
    await handleBackClick(page.deps);
    expect(
      page
        .savedEffects()
        .map((effect) => effect.tween.volume.keyframes[0].value),
    ).toEqual([60, 50, 60]);
  });

  it("undoes and redoes with the keyboard, but not in a text field", async () => {
    const page = await createPage();
    const listeners = {};
    const cleanup = handleBeforeMount({
      ...page.deps,
      browserEventsClient: {
        subscribeWindowEvent: ({ type, listener, options }) => {
          listeners[type] = { listener, options };
          return vi.fn();
        },
      },
      appService: {
        ...page.deps.appService,
        registerBeforeNavigation: vi.fn(),
      },
    });
    expect(listeners.keydown.options).toEqual({ capture: true });
    expect(cleanup).toBeTypeOf("function");
    page.store.setSelectedKeyframe({
      side: "update",
      property: "volume",
      index: 0,
    });
    page.typeValue(60);

    const inField = shortcut({
      composedPath: () => [{ tagName: "INPUT", type: "number" }],
    });
    listeners.keydown.listener(inField);
    expect(inField.preventDefault).not.toHaveBeenCalled();
    expect(page.keyframes()[0].value).toBe(60);

    // A slider keeps focus after a change, and undo still works there.
    const onSlider = shortcut({
      composedPath: () => [{ tagName: "INPUT", type: "range" }],
    });
    listeners.keydown.listener(onSlider);
    expect(onSlider.preventDefault).toHaveBeenCalled();
    expect(page.keyframes()[0].value).toBe(50);

    handleEditHistoryShortcutKeyDown(page.deps, {
      _event: shortcut({ shiftKey: true }),
    });
    expect(page.keyframes()[0].value).toBe(60);
  });
});
