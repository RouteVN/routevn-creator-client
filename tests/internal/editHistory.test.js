import { describe, expect, it } from "vitest";
import {
  areEditHistoryValuesEqual,
  createEditHistory,
  dropEditHistoryStep,
  getEditHistoryChangeKey,
  getEditHistoryStep,
  moveEditHistoryStep,
  recordEditHistoryStep,
} from "../../src/internal/editHistory.js";
import { resolveEditHistoryShortcut } from "../../src/internal/ui/editHistory.js";

const at = (x) => ({ a: { x } });

describe("edit history", () => {
  it("merges edits with one key less than a second apart", () => {
    const history = createEditHistory();
    recordEditHistoryStep(history, {
      before: at(0),
      after: at(1),
      mergeKey: "a",
      time: 0,
    });
    recordEditHistoryStep(history, {
      before: at(1),
      after: at(2),
      mergeKey: "a",
      time: 900,
    });
    recordEditHistoryStep(history, {
      before: at(2),
      after: at(3),
      mergeKey: "a",
      time: 2000,
    });

    expect(history.undo).toHaveLength(2);
    expect(history.undo[0]).toMatchObject({ before: at(0), after: at(2) });
    expect(history.undo[1]).toMatchObject({ before: at(2), after: at(3) });
  });

  it("does not merge edits without a key or with another key", () => {
    const history = createEditHistory();
    recordEditHistoryStep(history, { before: at(0), after: at(1), time: 0 });
    recordEditHistoryStep(history, { before: at(1), after: at(2), time: 0 });
    recordEditHistoryStep(history, {
      before: { b: 0 },
      after: { b: 1 },
      mergeKey: "b",
      time: 0,
    });

    expect(history.undo).toHaveLength(3);
  });

  it("keeps the first before of every item in a merged step", () => {
    const history = createEditHistory();
    recordEditHistoryStep(history, {
      before: { a: 0 },
      after: { a: 1 },
      mergeKey: "k",
      time: 0,
    });
    recordEditHistoryStep(history, {
      before: { a: 1, b: 5 },
      after: { a: 2, b: 6 },
      mergeKey: "k",
      time: 10,
    });

    expect(history.undo).toEqual([
      expect.objectContaining({
        before: { a: 0, b: 5 },
        after: { a: 2, b: 6 },
      }),
    ]);
  });

  it("drops edits that change nothing or cancel out", () => {
    const history = createEditHistory();
    recordEditHistoryStep(history, { before: at(0), after: at(0), time: 0 });
    expect(history.undo).toEqual([]);

    recordEditHistoryStep(history, {
      before: at(0),
      after: at(1),
      mergeKey: "a",
      time: 0,
    });
    recordEditHistoryStep(history, {
      before: at(1),
      after: at(0),
      mergeKey: "a",
      time: 10,
    });
    expect(history.undo).toEqual([]);
  });

  it("moves steps between undo and redo, and a new edit clears redo", () => {
    const history = createEditHistory();
    recordEditHistoryStep(history, { before: at(0), after: at(1), time: 0 });
    recordEditHistoryStep(history, { before: at(1), after: at(2), time: 0 });

    expect(getEditHistoryStep(history, "undo").after).toEqual(at(2));
    moveEditHistoryStep(history, "undo");
    expect(getEditHistoryStep(history, "redo").after).toEqual(at(2));
    moveEditHistoryStep(history, "redo");
    expect(history.redo).toEqual([]);
    moveEditHistoryStep(history, "undo");

    recordEditHistoryStep(history, { before: at(1), after: at(5), time: 0 });
    expect(history.redo).toEqual([]);
    expect(history.undo).toHaveLength(2);
    moveEditHistoryStep(history, "redo");
    expect(history.undo).toHaveLength(2);
  });

  it("does not merge a new edit into the step left on top after an undo", () => {
    const history = createEditHistory();
    for (const [x, time] of [
      [1, 0],
      [2, 2000],
    ]) {
      recordEditHistoryStep(history, {
        before: at(x - 1),
        after: at(x),
        mergeKey: "a",
        time,
      });
    }
    moveEditHistoryStep(history, "undo");

    recordEditHistoryStep(history, {
      before: at(1),
      after: at(9),
      mergeKey: "a",
      time: 2100,
    });

    expect(history.undo.map((step) => step.after)).toEqual([at(1), at(9)]);
  });

  it("keeps the latest 100 steps", () => {
    const history = createEditHistory();
    for (let x = 1; x <= 105; x += 1) {
      recordEditHistoryStep(history, {
        before: at(x - 1),
        after: at(x),
        time: 0,
      });
    }

    expect(history.undo).toHaveLength(100);
    expect(history.undo[0].before).toEqual(at(5));
  });

  it("drops a step without moving it to the other stack", () => {
    const history = createEditHistory();
    recordEditHistoryStep(history, { before: at(0), after: at(1), time: 0 });

    dropEditHistoryStep(history, "undo");

    expect(history).toEqual({ undo: [], redo: [] });
  });

  it("compares nested values regardless of key order", () => {
    expect(
      areEditHistoryValuesEqual(
        { a: { x: 1, y: [1, { z: 2 }] }, b: null },
        { b: null, a: { y: [1, { z: 2 }], x: 1 } },
      ),
    ).toBe(true);
    expect(areEditHistoryValuesEqual({ a: 1 }, { a: 1, b: undefined })).toBe(
      false,
    );
    expect(areEditHistoryValuesEqual([1], { 0: 1 })).toBe(false);
    expect(areEditHistoryValuesEqual({ x: NaN }, { x: NaN })).toBe(true);
  });
});

describe("edit history change keys", () => {
  const animation = (value, extra = {}) => ({
    update: { x: { keyframes: [{ value, duration: 1000, ...extra }] } },
  });

  it("names the values an edit changed", () => {
    expect(getEditHistoryChangeKey(animation(1), animation(2))).toBe(
      "/update/x/keyframes/0/value",
    );
    expect(
      getEditHistoryChangeKey(animation(1), animation(2, { duration: 500 })),
    ).toBe("/update/x/keyframes/0/value|/update/x/keyframes/0/duration");
    expect(getEditHistoryChangeKey(animation(1), animation(1))).toBe("");
  });

  it("gives edits that add or remove list items no key, so they never merge", () => {
    const twoKeyframes = {
      update: {
        x: {
          keyframes: [
            { value: 1, duration: 1000 },
            { value: 2, duration: 1000 },
          ],
        },
      },
    };

    expect(getEditHistoryChangeKey(animation(1), twoKeyframes)).toBeUndefined();
    expect(
      getEditHistoryChangeKey(animation(1), animation(1, { startValue: 0 })),
    ).toBe("/update/x/keyframes/0/startValue");
  });
});

describe("edit history shortcuts", () => {
  const press = (init) =>
    resolveEditHistoryShortcut({
      composedPath: () => [],
      metaKey: false,
      ctrlKey: false,
      ...init,
    });

  it("undoes with Cmd/Ctrl+Z and redoes with Shift or Ctrl+Y", () => {
    expect(press({ metaKey: true, key: "z", code: "KeyZ" })).toBe("undo");
    expect(press({ ctrlKey: true, key: "z", code: "KeyZ" })).toBe("undo");
    expect(
      press({ metaKey: true, shiftKey: true, key: "Z", code: "KeyZ" }),
    ).toBe("redo");
    expect(press({ ctrlKey: true, key: "y", code: "KeyY" })).toBe("redo");
    expect(press({ metaKey: true, key: "y", code: "KeyY" })).toBeUndefined();
    expect(press({ key: "z", code: "KeyZ" })).toBeUndefined();
  });

  it("follows the letter the keyboard layout types", () => {
    // QWERTZ: Y is on the KeyZ code; AZERTY: W is on the KeyZ code.
    expect(press({ ctrlKey: true, key: "y", code: "KeyZ" })).toBe("redo");
    expect(press({ ctrlKey: true, key: "w", code: "KeyZ" })).toBeUndefined();
    // A layout without Latin letters falls back to the physical key.
    expect(press({ ctrlKey: true, key: "я", code: "KeyZ" })).toBe("undo");
  });

  it("keeps working after a slider, checkbox, or select change", () => {
    for (const node of [
      { tagName: "INPUT", type: "range" },
      { tagName: "INPUT", type: "checkbox" },
      { tagName: "SELECT" },
      { tagName: "RTGL-SELECT" },
    ]) {
      expect(
        press({
          metaKey: true,
          key: "z",
          code: "KeyZ",
          composedPath: () => [node],
        }),
      ).toBe("undo");
    }
  });

  it("leaves the keys to fields and open dialogs", () => {
    expect(
      press({
        metaKey: true,
        key: "z",
        code: "KeyZ",
        composedPath: () => [{ tagName: "INPUT" }],
      }),
    ).toBeUndefined();
    expect(
      press({
        metaKey: true,
        key: "z",
        code: "KeyZ",
        composedPath: () => [{ tagName: "BUTTON" }, { tagName: "DIALOG" }],
      }),
    ).toBeUndefined();
    for (const node of [
      { tagName: "INPUT", type: "text" },
      { tagName: "INPUT", type: "number" },
      { tagName: "TEXTAREA" },
      { tagName: "DIV", isContentEditable: true },
    ]) {
      expect(
        press({
          metaKey: true,
          key: "z",
          code: "KeyZ",
          composedPath: () => [node],
        }),
      ).toBeUndefined();
    }
  });
});
