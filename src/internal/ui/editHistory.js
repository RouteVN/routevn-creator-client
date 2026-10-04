import { selectI18nCopy } from "./i18nCopy.js";

// Shared pieces of undo and redo for editor pages, whose stores keep the
// history (src/internal/editHistory.js).

export const selectEditHistoryCopy = (i18n) =>
  selectI18nCopy(i18n, ["editHistory"]);

// The letter typed, from the layout's key, or from the physical key when the
// layout does not type a Latin letter (such as Cyrillic). The physical key
// alone is wrong on layouts like QWERTZ, where Y sits on the KeyZ code.
const getShortcutLetter = (event) => {
  const key = event.key?.toLowerCase();
  if (/^[a-z]$/.test(key)) {
    return key;
  }
  return event.code?.match(/^Key([A-Z])$/)?.[1].toLowerCase();
};

// Inputs without text to undo. A slider, checkbox, or select keeps focus
// after a change, and undo should still work then.
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const isTextEditNode = (node) =>
  node.isContentEditable === true ||
  node.tagName === "TEXTAREA" ||
  (node.tagName === "INPUT" && !NON_TEXT_INPUT_TYPES.has(node.type));

// Cmd/Ctrl+Z undoes; Shift+Cmd/Ctrl+Z and Ctrl+Y redo. A focused text field
// keeps the keys for its own text undo, and an open dialog keeps them from
// the page behind it.
export const resolveEditHistoryShortcut = (event) => {
  if (!event || event.altKey || !(event.metaKey || event.ctrlKey)) {
    return undefined;
  }
  const path = event.composedPath();
  if (path.some((node) => isTextEditNode(node) || node.tagName === "DIALOG")) {
    return undefined;
  }
  const letter = getShortcutLetter(event);
  if (letter === "z") {
    return event.shiftKey ? "redo" : "undo";
  }
  if (letter === "y" && event.ctrlKey && !event.shiftKey) {
    return "redo";
  }
  return undefined;
};
