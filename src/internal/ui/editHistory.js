import { isTextEntryKeyEvent } from "./fileExplorerKeyboardScope.js";
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

// Cmd/Ctrl+Z undoes; Shift+Cmd/Ctrl+Z and Ctrl+Y redo. A focused field keeps
// the keys for its own text undo, and an open dialog keeps them from the page
// behind it.
export const resolveEditHistoryShortcut = (event) => {
  if (
    !event ||
    event.altKey ||
    !(event.metaKey || event.ctrlKey) ||
    isTextEntryKeyEvent(event) ||
    event.composedPath().some((node) => node.tagName === "DIALOG")
  ) {
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
