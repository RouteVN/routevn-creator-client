import { describe, expect, it } from "vitest";
import {
  areEditHistoryValuesEqual,
  createEditHistory,
  getEditHistoryStep,
  moveEditHistoryStep,
  recordEditHistoryStep,
} from "../../src/internal/editHistory.js";

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
  });
});
