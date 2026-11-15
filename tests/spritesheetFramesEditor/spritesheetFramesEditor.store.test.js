import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import * as storeModule from "../../src/components/spritesheetFramesEditor/spritesheetFramesEditor.store.js";

const frame = (name, size = 32) => ({
  name,
  url: `blob:${name}`,
  width: size,
  height: size,
});

// Runs store actions through Immer, as the component store does, so undo
// snapshots behave as they do in the app.
const createStore = () => {
  let state = storeModule.createInitialState();
  const store = {
    get state() {
      return state;
    },
  };
  for (const [name, fn] of Object.entries(storeModule)) {
    if (name === "createInitialState") {
      continue;
    }
    store[name] = name.startsWith("select")
      ? (payload) => fn({ state, i18n: EN_I18N }, payload)
      : (payload) => {
          state = produce(state, (draft) => {
            fn({ state: draft }, payload);
          });
        };
  }
  return store;
};

const getClip = (state) =>
  state.clips.find((clip) => clip.name === state.selectedClipName);

const getEntryFrameNames = (state) => {
  const namesByKey = new Map(state.frames.map((item) => [item.key, item.name]));
  return getClip(state).entries.map((entry) => namesByKey.get(entry.frameKey));
};

const getEntryKey = (state, index) => getClip(state).entries[index].key;

// An edit as the component makes it: the change, then its undo record.
let time = 0;
const edit = (store, action, payload) => {
  store[action](payload);
  time += 5000;
  store.recordEdit({ time });
};

describe("spritesheetFramesEditor store", () => {
  it("adds pictures to a new default clip", () => {
    const store = createStore();
    store.loadDraft({ frames: [], sourceKind: "pictures", defaultFps: 12 });

    edit(store, "addFrames", { frames: [frame("a"), frame("b")] });

    expect(store.state.clips).toHaveLength(1);
    expect(store.state.clips[0]).toMatchObject({ name: "default", fps: 12 });
    expect(getEntryFrameNames(store.state)).toEqual(["a", "b"]);
    expect(store.state.status).toBe("ready");
    expect(store.selectDraft()).toMatchObject({
      framesChanged: true,
      hasChanges: true,
    });
  });

  it("starts new clips at 12 fps and keeps saved clips without fps at 24", () => {
    const store = createStore();
    store.loadDraft({ frames: [] });
    store.addFrames({ frames: [frame("a")] });
    expect(getClip(store.state).fps).toBe(12);

    store.loadDraft({
      frames: [frame("a"), frame("b")],
      animations: {
        walk: { frames: [0, 1], fps: 8 },
        stand: { frames: [0] },
      },
      sourceKind: "sheet",
    });

    expect(store.state.clips.map(({ name, fps }) => ({ name, fps }))).toEqual([
      { name: "walk", fps: 8 },
      { name: "stand", fps: 24 },
    ]);
  });

  it("inserts pictures dropped on a frame after it", () => {
    const store = createStore();
    store.loadDraft({ frames: [] });
    store.addFrames({ frames: [frame("a"), frame("c")] });

    store.addFrames({
      frames: [frame("b")],
      afterEntryKey: getEntryKey(store.state, 0),
    });
    store.addFrames({ frames: [frame("d")] });

    expect(getEntryFrameNames(store.state)).toEqual(["a", "b", "c", "d"]);
  });

  it("moves, holds, and removes a frame", () => {
    const store = createStore();
    store.loadDraft({ frames: [] });
    store.addFrames({ frames: [frame("a"), frame("b"), frame("c")] });
    const keyA = getEntryKey(store.state, 0);

    store.moveEntryBy({ entryKey: keyA, offset: 1 });
    expect(getEntryFrameNames(store.state)).toEqual(["b", "a", "c"]);
    store.moveEntryBy({ entryKey: keyA, offset: -1 });
    expect(getEntryFrameNames(store.state)).toEqual(["a", "b", "c"]);
    // Moving past either end does nothing.
    store.moveEntryBy({ entryKey: keyA, offset: -1 });
    expect(getEntryFrameNames(store.state)).toEqual(["a", "b", "c"]);

    store.setEntryHold({ entryKey: keyA, hold: 3 });
    expect(getClip(store.state).entries[0].hold).toBe(3);
    store.setEntryHold({ entryKey: keyA, hold: 0 });
    expect(getClip(store.state).entries[0].hold).toBe(1);

    store.removeEntry({ entryKey: keyA });
    expect(getEntryFrameNames(store.state)).toEqual(["b", "c"]);
    // The picture stays, so undo can bring the frame back.
    expect(store.state.frames).toHaveLength(3);
  });

  it("loads clips with holds and remembers frames no clip uses", () => {
    const store = createStore();
    store.loadDraft({
      frames: [frame("a"), frame("b"), frame("unused")],
      animations: {
        spin: { frames: [0, 1, 1], fps: 8, loop: false },
        look: { frames: [1] },
      },
      sourceKind: "sheet",
    });

    expect(store.state.clips.map((clip) => clip.name)).toEqual([
      "spin",
      "look",
    ]);
    expect(getClip(store.state).entries.map((entry) => entry.hold)).toEqual([
      1, 2,
    ]);
    expect(store.state.keepFrameKeys).toEqual([store.state.frames[2].key]);
    expect(store.selectDraft()).toMatchObject({
      framesChanged: false,
      hasChanges: false,
    });

    store.setSelectedClipName({ clipName: "look" });
    expect(getEntryFrameNames(store.state)).toEqual(["b"]);

    const viewData = store.selectViewData();
    expect(viewData.showClipSelect).toBe(true);
    expect(viewData.showConversionNote).toBe(true);
    expect(viewData.framesTitle).toBe("1 frame");
  });

  it("sizes frames to fit the largest picture", () => {
    const store = createStore();
    store.loadDraft({
      frames: [frame("a", 32), { ...frame("tall"), width: 20, height: 48 }],
      animations: { default: { frames: [0, 1] } },
      sourceKind: "frames",
    });

    expect(store.selectDraft()).toMatchObject({
      frameWidth: 32,
      frameHeight: 48,
    });
    expect(store.selectViewData().frameSizeText).toBe("32 × 48");

    // Without the tall picture, the frames shrink to fit the rest.
    edit(store, "removeEntry", { entryKey: getEntryKey(store.state, 1) });
    expect(store.selectDraft()).toMatchObject({
      frameWidth: 32,
      frameHeight: 32,
      framesChanged: true,
    });

    edit(store, "removeEntry", { entryKey: getEntryKey(store.state, 0) });
    expect(store.selectViewData().frameSizeText).toBe("–");
  });

  it("tracks a clip FPS change apart from frame changes", () => {
    const store = createStore();
    store.loadDraft({
      frames: [frame("a")],
      animations: { default: { frames: [0], fps: 12 } },
      sourceKind: "frames",
    });

    store.setSelectedClipFps({ fps: 6 });

    expect(store.selectDraft()).toMatchObject({
      framesChanged: false,
      fpsChanged: true,
      hasChanges: true,
    });
    expect(getClip(store.state).fps).toBe(6);
  });

  it("gives the preview the frame's shape", () => {
    const store = createStore();
    store.loadDraft({ frames: [] });
    expect(store.selectViewData()).toMatchObject({
      hasFrames: false,
      framesTitle: "0 frames",
      showClipSelect: false,
      previewBoxStyle:
        "width: min(100cqw, calc(65vh * 4 / 3)); aspect-ratio: 4 / 3; min-height: 0; flex-shrink: 0;",
    });

    store.addFrames({ frames: [{ ...frame("a"), width: 32, height: 64 }] });
    expect(store.selectViewData().previewBoxStyle).toBe(
      "width: min(100cqw, calc(65vh * 32 / 64)); aspect-ratio: 32 / 64; min-height: 0; flex-shrink: 0;",
    );
  });

  it("undoes and redoes edits, back to the saved frames", () => {
    const store = createStore();
    store.loadDraft({
      frames: [frame("a"), frame("b"), frame("c")],
      animations: { default: { frames: [0, 1, 2], fps: 12 } },
      sourceKind: "frames",
    });
    expect(store.selectEditHistoryState()).toEqual({
      canUndo: false,
      canRedo: false,
    });

    edit(store, "removeEntry", { entryKey: getEntryKey(store.state, 1) });
    edit(store, "setSelectedClipFps", { fps: 6 });
    expect(getEntryFrameNames(store.state)).toEqual(["a", "c"]);

    store.applyEditHistoryStep({ direction: "undo" });
    expect(getClip(store.state).fps).toBe(12);
    store.applyEditHistoryStep({ direction: "undo" });
    expect(getEntryFrameNames(store.state)).toEqual(["a", "b", "c"]);
    expect(store.selectDraft().hasChanges).toBe(false);
    expect(store.selectEditHistoryState()).toEqual({
      canUndo: false,
      canRedo: true,
    });

    store.applyEditHistoryStep({ direction: "redo" });
    expect(getEntryFrameNames(store.state)).toEqual(["a", "c"]);
    expect(store.selectDraft()).toMatchObject({
      framesChanged: true,
      hasChanges: true,
    });

    // A new edit clears redo.
    edit(store, "setEntryHold", {
      entryKey: getEntryKey(store.state, 0),
      hold: 4,
    });
    expect(store.selectEditHistoryState()).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });

  it("makes typing one hold one undo step", () => {
    const store = createStore();
    store.loadDraft({
      frames: [frame("a")],
      animations: { default: { frames: [0] } },
      sourceKind: "frames",
    });
    const entryKey = getEntryKey(store.state, 0);

    store.setEntryHold({ entryKey, hold: 2 });
    store.recordEdit({ time: 1000 });
    store.setEntryHold({ entryKey, hold: 25 });
    store.recordEdit({ time: 1400 });

    store.applyEditHistoryStep({ direction: "undo" });
    expect(getClip(store.state).entries[0].hold).toBe(1);
    expect(store.selectEditHistoryState().canUndo).toBe(false);
  });

  it("shows the clip an undo changes", () => {
    const store = createStore();
    store.loadDraft({
      frames: [frame("a"), frame("b")],
      animations: {
        walk: { frames: [0, 1] },
        stand: { frames: [0] },
      },
      sourceKind: "frames",
    });
    edit(store, "removeEntry", { entryKey: getEntryKey(store.state, 0) });
    store.setSelectedClipName({ clipName: "stand" });

    store.applyEditHistoryStep({ direction: "undo" });

    expect(store.state.selectedClipName).toBe("walk");
    expect(getEntryFrameNames(store.state)).toEqual(["a", "b"]);
  });

  it("keeps edits made while a save ran unsaved", () => {
    const store = createStore();
    store.loadDraft({ frames: [] });
    edit(store, "addFrames", { frames: [frame("a"), frame("b")] });
    const savedDraft = store.selectDraft();
    const [keyA, keyB] = savedDraft.frames.map((item) => item.key);
    edit(store, "addFrames", { frames: [frame("c")] });

    store.markSaved({
      fileIdByFrameKey: { [keyA]: "file-a", [keyB]: "file-b" },
      content: savedDraft.content,
    });

    expect(store.state.frames.map((item) => item.fileId)).toEqual([
      "file-a",
      "file-b",
      undefined,
    ]);
    expect(store.selectDraft()).toMatchObject({
      sourceKind: "frames",
      framesChanged: true,
      hasChanges: true,
    });

    store.markSaved({
      fileIdByFrameKey: {},
      content: store.selectDraft().content,
    });
    expect(store.selectDraft().hasChanges).toBe(false);
  });

  it("brings back a frame a save left out, with its saved file", () => {
    const store = createStore();
    store.loadDraft({
      frames: [
        { ...frame("a"), fileId: "file-a" },
        { ...frame("b"), fileId: "file-b" },
      ],
      animations: { default: { frames: [0, 1] } },
      sourceKind: "frames",
    });
    edit(store, "removeEntry", { entryKey: getEntryKey(store.state, 1) });
    const savedDraft = store.selectDraft();
    store.markSaved({
      fileIdByFrameKey: { [savedDraft.frames[0].key]: "file-a" },
      content: savedDraft.content,
    });

    store.applyEditHistoryStep({ direction: "undo" });

    expect(getEntryFrameNames(store.state)).toEqual(["a", "b"]);
    expect(store.state.frames.map((item) => item.fileId)).toEqual([
      "file-a",
      "file-b",
    ]);
    expect(store.selectDraft().hasChanges).toBe(true);
  });

  it("has nothing to save before a spritesheet loads", () => {
    const store = createStore();
    store.startLoading();

    expect(store.selectDraft().hasChanges).toBe(false);
  });
});
