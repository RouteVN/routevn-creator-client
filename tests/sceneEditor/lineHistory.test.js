import { describe, expect, it } from "vitest";
import {
  createEditHistory,
  getEditHistoryStep,
  moveEditHistoryStep,
  recordEditHistoryStep,
} from "../../src/internal/editHistory.js";
import {
  diffSceneEditorSectionLines,
  getSceneEditorLineEditMergeKey,
  getSceneEditorRestoreCaret,
  getSceneEditorRestoreFocus,
  restoreSceneEditorSectionLines,
} from "../../src/internal/ui/sceneEditorLexical/lineHistory.js";

const line = (id, text, actions = {}) => ({
  id,
  sectionId: "section-1",
  actions: { ...actions, dialogue: { content: [{ text }] } },
});

const texts = (lines) =>
  lines.map((item) => `${item.id}:${item.actions.dialogue.content[0].text}`);

describe("scene editor line history", () => {
  it("records only the line typed in, keyed by its text", () => {
    const before = [line("a", "One"), line("b", "Two")];
    const after = [line("a", "One"), line("b", "Two!")];

    const step = diffSceneEditorSectionLines({
      sectionId: "section-1",
      before,
      after,
    });

    expect(Object.keys(step.before)).toEqual(["b"]);
    expect(step.before.b).toMatchObject({ sectionId: "section-1", index: 1 });
    expect(getSceneEditorLineEditMergeKey(step.before, step.after)).toBe(
      "text:section-1:b",
    );
  });

  it("merges the first letter typed into an empty line with the rest", () => {
    const empty = [{ id: "a", actions: { dialogue: { content: [] } } }];
    const typed = (text) =>
      diffSceneEditorSectionLines({
        sectionId: "section-1",
        before: empty,
        after: [line("a", text)],
      });
    const first = typed("H");
    expect(getSceneEditorLineEditMergeKey(first.before, first.after)).toBe(
      "text:section-1:a",
    );

    // A new line or an action change does not merge.
    const added = diffSceneEditorSectionLines({
      sectionId: "section-1",
      before: empty,
      after: [...empty, line("b", "")],
    });
    expect(
      getSceneEditorLineEditMergeKey(added.before, added.after),
    ).toBeUndefined();
    const actionChanged = diffSceneEditorSectionLines({
      sectionId: "section-1",
      before: [line("a", "One")],
      after: [line("a", "One", { bgm: { resourceId: "m1" } })],
    });
    expect(
      getSceneEditorLineEditMergeKey(actionChanged.before, actionChanged.after),
    ).toBeUndefined();
  });

  it("touches only the moved line and the inserted line, not the lines they pass", () => {
    const lines = ["a", "b", "c", "d", "e"].map((id) => line(id, id));
    const moved = [lines[0], lines[2], lines[3], lines[1], lines[4]];
    expect(
      Object.keys(
        diffSceneEditorSectionLines({
          sectionId: "section-1",
          before: lines,
          after: moved,
        }).before,
      ),
    ).toEqual(["b"]);

    const inserted = [lines[0], line("new", ""), ...lines.slice(1)];
    const step = diffSceneEditorSectionLines({
      sectionId: "section-1",
      before: lines,
      after: inserted,
    });
    expect(step.before).toEqual({ new: null });
    expect(step.after.new).toMatchObject({ index: 1 });
  });

  it("counts an action change as a change, ignoring key order", () => {
    const before = [
      line("a", "One", { bgm: { resourceId: "m1", loop: true } }),
    ];
    const reordered = [
      line("a", "One", { bgm: { loop: true, resourceId: "m1" } }),
    ];
    const changed = [line("a", "One", { bgm: { resourceId: "m2" } })];

    expect(
      diffSceneEditorSectionLines({
        sectionId: "section-1",
        before,
        after: reordered,
      }).before,
    ).toEqual({});
    expect(
      Object.keys(
        diffSceneEditorSectionLines({
          sectionId: "section-1",
          before,
          after: changed,
        }).before,
      ),
    ).toEqual(["a"]);
  });

  it("undoes and redoes random edits, merged or not, back to each version", () => {
    let seed = 7;
    const random = (limit) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % limit;
    };
    let nextId = 0;
    for (let run = 0; run < 200; run += 1) {
      let lines = Array.from({ length: 1 + random(5) }, () =>
        line(`l${nextId++}`, "x"),
      );
      const versions = [lines];
      const history = createEditHistory();
      for (let edit = 0; edit < 8; edit += 1) {
        const next = lines.map((item) => structuredClone(item));
        const kind = random(5);
        const index = random(next.length);
        if (kind === 0) {
          next.splice(random(next.length + 1), 0, line(`l${nextId++}`, "new"));
        } else if (kind === 1 && next.length > 1) {
          next.splice(index, 1);
        } else if (kind === 2) {
          const [movedLine] = next.splice(index, 1);
          next.splice(random(next.length + 1), 0, movedLine);
        } else if (kind === 3) {
          next[index].actions.dialogue.content[0].text += "y";
        } else {
          next[index].actions.background = { resourceId: `b${random(3)}` };
        }
        const step = diffSceneEditorSectionLines({
          sectionId: "section-1",
          before: lines,
          after: next,
        });
        recordEditHistoryStep(history, {
          ...step,
          mergeKey: getSceneEditorLineEditMergeKey(step.before, step.after),
          time: edit * 400,
        });
        lines = next;
        versions.push(lines);
      }

      // Undo everything, then redo everything.
      const restore = (direction) => {
        const step = getEditHistoryStep(history, direction);
        moveEditHistoryStep(history, direction);
        lines = restoreSceneEditorSectionLines({
          sectionId: "section-1",
          lines,
          target: direction === "undo" ? step.before : step.after,
        });
      };
      while (history.undo.length > 0) {
        restore("undo");
      }
      expect(texts(lines)).toEqual(texts(versions[0]));
      expect(lines).toEqual(versions[0]);
      while (history.redo.length > 0) {
        restore("redo");
      }
      expect(lines).toEqual(versions.at(-1));
    }
  });

  it("puts the caret where the text changed, or at the end", () => {
    expect(
      getSceneEditorRestoreCaret(
        line("a", "Hello there world"),
        line("a", "Hello world"),
      ),
    ).toBe(6);
    expect(
      getSceneEditorRestoreCaret(
        line("a", "Hello world"),
        line("a", "Hello there world"),
      ),
    ).toBe(12);
    expect(
      getSceneEditorRestoreCaret(line("a", "Same"), line("a", "Same")),
    ).toBeUndefined();
    expect(getSceneEditorRestoreCaret(undefined, line("a", "New"))).toBe(
      undefined,
    );
  });

  it("selects the first restored line, or the line before a removed one", () => {
    const restored = [line("a", "One"), line("b", "Two")];
    expect(
      getSceneEditorRestoreFocus({
        sections: [{ id: "section-1", lines: restored }],
        target: {
          b: { sectionId: "section-1", index: 1, line: line("b", "Two") },
        },
        previous: {
          b: { sectionId: "section-1", index: 1, line: line("b", "Two!") },
        },
      }),
    ).toEqual({ sectionId: "section-1", lineId: "b", cursorPosition: 3 });

    // Undoing a new line at index 2 selects line b, before it.
    expect(
      getSceneEditorRestoreFocus({
        sections: [{ id: "section-1", lines: restored }],
        target: { c: null },
        previous: {
          c: { sectionId: "section-1", index: 2, line: line("c", "") },
        },
      }),
    ).toEqual({ sectionId: "section-1", lineId: "b" });
  });
});
