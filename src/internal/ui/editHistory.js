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

// Cmd/Ctrl+Z undoes and Shift+Cmd/Ctrl+Z redoes. A focused text field
// keeps the keys for its own text undo, and an open dialog keeps them from
// the page behind it. A page whose text editor uses the page's undo instead
// names it in `textEditorTagName`; the editor's editable text then takes the
// keys too. Keys that confirm an IME composition are never a shortcut.
export const resolveEditHistoryShortcut = (
  event,
  { textEditorTagName } = {},
) => {
  if (!event || event.altKey || !(event.metaKey || event.ctrlKey)) {
    return undefined;
  }
  if (event.isComposing || event.keyCode === 229) {
    return undefined;
  }
  const path = event.composedPath();
  const editorIndex = textEditorTagName
    ? path.findIndex((node) => node.tagName === textEditorTagName.toUpperCase())
    : -1;
  const isOwnEditorText = (node, index) =>
    index < editorIndex && node.isContentEditable === true;
  if (
    path.some(
      (node, index) =>
        node.tagName === "DIALOG" ||
        (isTextEditNode(node) && !isOwnEditorText(node, index)),
    )
  ) {
    return undefined;
  }
  if (getShortcutLetter(event) !== "z") {
    return undefined;
  }
  return event.shiftKey ? "redo" : "undo";
};
