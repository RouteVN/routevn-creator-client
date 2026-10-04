// Undo and redo steps for an editor page, kept in its store while the page
// is open. A step holds snapshots of the items an edit touched, keyed by id,
// from before and after the edit. Edits with the same merge key less than a
// second apart are one step: a drag, keyboard nudges, or a form that saves
// several fields at once.
export const EDIT_HISTORY_MERGE_WINDOW_MS = 1000;
const MAX_EDIT_HISTORY_STEPS = 100;

export const areEditHistoryValuesEqual = (a, b) => {
  if (Object.is(a, b)) {
    return true;
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false;
  }
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(b, key) && areEditHistoryValuesEqual(a[key], b[key]),
    )
  );
};

// The paths of the values two snapshots differ in, for use as a merge key:
// repeated edits to the same values, such as typing a number or dragging a
// slider, merge, and an edit to anything else is a new step. An edit that
// adds or removes list items, such as a keyframe, has no key and never
// merges, so each add or delete is its own step.
export const getEditHistoryChangeKey = (before, after) => {
  const paths = [];
  let resizedList = false;
  const isObject = (value) => value !== null && typeof value === "object";
  const visit = (a, b, path) => {
    if (areEditHistoryValuesEqual(a, b)) {
      return;
    }
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) {
      resizedList = true;
      return;
    }
    if (isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        visit(a[key], b[key], `${path}/${key}`);
      }
      return;
    }
    paths.push(path);
  };
  visit(before, after, "");
  return resizedList ? undefined : paths.join("|");
};

export const createEditHistory = () => ({ undo: [], redo: [] });

// Adds an edit to `history`. A new edit clears redo.
export const recordEditHistoryStep = (
  history,
  { before, after, mergeKey, time },
) => {
  const lastStep = history.undo.at(-1);
  if (
    mergeKey !== undefined &&
    lastStep?.mergeKey === mergeKey &&
    !lastStep.sealed &&
    time - lastStep.time <= EDIT_HISTORY_MERGE_WINDOW_MS
  ) {
    lastStep.before = { ...before, ...lastStep.before };
    lastStep.after = { ...lastStep.after, ...after };
    lastStep.time = time;
    // Edits that cancel out, such as hiding and showing again, leave
    // nothing to undo.
    if (areEditHistoryValuesEqual(lastStep.before, lastStep.after)) {
      history.undo.pop();
    }
  } else if (areEditHistoryValuesEqual(before, after)) {
    return;
  } else {
    history.undo.push({ before, after, mergeKey, time });
    if (history.undo.length > MAX_EDIT_HISTORY_STEPS) {
      history.undo.shift();
    }
  }
  history.redo = [];
};

export const getEditHistoryStep = (history, direction) =>
  history[direction].at(-1);

// Removes the latest undo or redo step, for a step that can no longer apply.
export const dropEditHistoryStep = (history, direction) => {
  history[direction].pop();
};

// Moves the latest undo or redo step to the other stack. The step now on top
// of undo stays its own step, so a later edit does not merge into it.
export const moveEditHistoryStep = (history, direction) => {
  const [from, to] = direction === "undo" ? ["undo", "redo"] : ["redo", "undo"];
  const step = history[from].pop();
  if (!step) {
    return;
  }
  history[to].push(step);
  const lastStep = history.undo.at(-1);
  if (lastStep) {
    lastStep.sealed = true;
  }
};
