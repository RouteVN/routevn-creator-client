import { isTextEntryKeyEvent } from "./fileExplorerKeyboardScope.js";
import { selectI18nCopy } from "./i18nCopy.js";

// Shared pieces of undo and redo for editor pages, whose stores keep the
// history (src/internal/editHistory.js).

export const selectEditHistoryCopy = (i18n) =>
  selectI18nCopy(i18n, ["editHistory"]);

// Cmd/Ctrl+Z undoes; Shift+Cmd/Ctrl+Z and Ctrl+Y redo. A focused field keeps
// the keys for its own text undo.
export const resolveEditHistoryShortcut = (event) => {
  if (
    !event ||
    event.altKey ||
    !(event.metaKey || event.ctrlKey) ||
    isTextEntryKeyEvent(event)
  ) {
    return undefined;
  }
  if (event.code === "KeyZ" || event.key?.toLowerCase() === "z") {
    return event.shiftKey ? "redo" : "undo";
  }
  if (
    event.ctrlKey &&
    !event.shiftKey &&
    (event.code === "KeyY" || event.key?.toLowerCase() === "y")
  ) {
    return "redo";
  }
  return undefined;
};
