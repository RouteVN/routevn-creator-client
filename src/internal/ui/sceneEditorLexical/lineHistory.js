import { areEditHistoryValuesEqual } from "../../editHistory.js";
import {
  areContentsEqual,
  getLineDialogueContent,
  getPlainTextFromContent,
} from "./contentModel.js";
import { cloneSceneEditorLine } from "./draftSection.js";

// Undo history for scene editor lines. A step records, for each line an edit
// touched, its section, its index in that section, and the line, or null where
// the line does not exist. Restoring a step removes every line it covers and
// puts its version of them back by index.

const getActionsWithoutDialogueContent = (line) => {
  const { dialogue, ...actions } = line?.actions ?? {};
  if (dialogue) {
    const { content: _content, ...dialogueFields } = dialogue;
    actions.dialogue = dialogueFields;
  }
  return actions;
};

// Two versions of a line hold the same text and actions.
export const areSceneEditorLineVersionsEqual = (left, right) =>
  areContentsEqual(
    getLineDialogueContent(left),
    getLineDialogueContent(right),
  ) &&
  areEditHistoryValuesEqual(
    getActionsWithoutDialogueContent(left),
    getActionsWithoutDialogueContent(right),
  );

// The positions, in `values`, of a longest run of increasing values.
const getLongestIncreasingRun = (values) => {
  const tails = [];
  const previous = [];
  for (const [position, value] of values.entries()) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[tails[middle]] < value) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    previous[position] = low > 0 ? tails[low - 1] : -1;
    tails[low] = position;
  }
  const run = [];
  for (
    let position = tails.at(-1) ?? -1;
    position >= 0;
    position = previous[position]
  ) {
    run.unshift(position);
  }
  return run;
};

// The lines of one section that an edit touched, before and after it: lines
// created, deleted, or changed, and lines moved. A line counts as moved when
// it is outside the longest run of lines that kept their order, so moving one
// line does not touch the lines it passes.
export const diffSceneEditorSectionLines = ({
  sectionId,
  before = [],
  after = [],
}) => {
  const beforeIndexes = new Map(before.map((line, index) => [line.id, index]));
  const afterIndexes = new Map(after.map((line, index) => [line.id, index]));
  const kept = after.filter((line) => beforeIndexes.has(line.id));
  const keptOrder = new Set(
    getLongestIncreasingRun(kept.map((line) => beforeIndexes.get(line.id))).map(
      (position) => kept[position].id,
    ),
  );

  const touchedIds = [];
  for (const line of before) {
    if (!afterIndexes.has(line.id)) {
      touchedIds.push(line.id);
    }
  }
  for (const line of after) {
    if (
      !keptOrder.has(line.id) ||
      !areSceneEditorLineVersionsEqual(before[beforeIndexes.get(line.id)], line)
    ) {
      touchedIds.push(line.id);
    }
  }

  // A line is kept in one shape, as the page's drafts hold it, since
  // committed lines and editor lines carry different extra fields.
  const getEntries = (lines, indexes) => {
    const entries = {};
    for (const lineId of touchedIds) {
      entries[lineId] = indexes.has(lineId)
        ? {
            sectionId,
            index: indexes.get(lineId),
            line: cloneSceneEditorLine({
              id: lineId,
              sectionId,
              actions: lines[indexes.get(lineId)].actions ?? {},
            }),
          }
        : null;
    }
    return entries;
  };
  return {
    before: getEntries(before, beforeIndexes),
    after: getEntries(after, afterIndexes),
  };
};

// Typing in one line merges into one step: an edit that changed only the text
// of one line, in place, has that line as its merge key. Other edits, such as
// new, moved, or deleted lines and action edits, never merge.
export const getSceneEditorLineEditMergeKey = (before, after) => {
  const lineIds = Object.keys(before);
  if (lineIds.length !== 1) {
    return undefined;
  }
  const [lineId] = lineIds;
  const previous = before[lineId];
  const next = after[lineId];
  if (
    !previous ||
    !next ||
    previous.sectionId !== next.sectionId ||
    previous.index !== next.index ||
    !areEditHistoryValuesEqual(
      getActionsWithoutDialogueContent(previous.line),
      getActionsWithoutDialogueContent(next.line),
    )
  ) {
    return undefined;
  }
  return `text:${next.sectionId}:${lineId}`;
};

// Brings one section's lines back to a step's version of them: removes every
// line the step covers, then inserts the step's lines in this section at their
// indices, lowest first.
export const restoreSceneEditorSectionLines = ({
  sectionId,
  lines = [],
  target = {},
}) => {
  const restoredLines = lines.filter((line) => !Object.hasOwn(target, line.id));
  const entries = Object.values(target)
    .filter((entry) => entry?.sectionId === sectionId)
    .sort((left, right) => left.index - right.index);
  for (const entry of entries) {
    restoredLines.splice(
      Math.min(entry.index, restoredLines.length),
      0,
      cloneSceneEditorLine(entry.line),
    );
  }
  return restoredLines;
};

const getLinePlainText = (line) =>
  getPlainTextFromContent(getLineDialogueContent(line));

// Where the caret goes in a restored line: after the text that differs from
// the line before the restore, or undefined, meaning the end of the line, when
// the line comes back or its text is the same.
export const getSceneEditorRestoreCaret = (previousLine, restoredLine) => {
  if (!previousLine) {
    return undefined;
  }
  const previous = getLinePlainText(previousLine);
  const restored = getLinePlainText(restoredLine);
  if (previous === restored) {
    return undefined;
  }
  let start = 0;
  while (
    start < previous.length &&
    start < restored.length &&
    previous[start] === restored[start]
  ) {
    start += 1;
  }
  let end = 0;
  while (
    end < previous.length - start &&
    end < restored.length - start &&
    previous[previous.length - 1 - end] === restored[restored.length - 1 - end]
  ) {
    end += 1;
  }
  return restored.length - end;
};

// The line to select after restoring `target` over `previous` (the step's
// other side): the first line, in scene order, that the restore brings back
// or changes; or, when it only removes lines, the line before the first one
// removed. `sections` lists the scene's sections with their restored lines.
export const getSceneEditorRestoreFocus = ({
  sections = [],
  target = {},
  previous = {},
}) => {
  for (const section of sections) {
    const entry = Object.values(target)
      .filter((item) => item?.sectionId === section.id)
      .sort((left, right) => left.index - right.index)[0];
    if (entry) {
      return {
        sectionId: section.id,
        lineId: entry.line.id,
        cursorPosition: getSceneEditorRestoreCaret(
          previous[entry.line.id]?.line,
          entry.line,
        ),
      };
    }
  }
  for (const section of sections) {
    const removed = Object.values(previous)
      .filter((item) => item?.sectionId === section.id)
      .sort((left, right) => left.index - right.index)[0];
    const line = removed
      ? section.lines[Math.max(0, removed.index - 1)]
      : undefined;
    if (line) {
      return { sectionId: section.id, lineId: line.id };
    }
  }
  return undefined;
};
