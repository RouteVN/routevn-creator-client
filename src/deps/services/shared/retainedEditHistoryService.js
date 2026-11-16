import { isEditHistoryEmpty } from "../../../internal/editHistory.js";

// Keeps one editor page's undo history after the page is left, so coming
// back to it brings undo and redo back. Only one history is kept: it belongs
// to the last editor an edit was recorded in, and is dropped when another
// editor is left with steps of its own. It lives in memory only.
//
// `owner` names the editor and the item it edits (`getEditHistoryOwner`).
// `content` is the item as the page left it, for pages whose steps hold the
// whole item (`resumeEditHistory` in src/internal/editHistory.js).
export const createRetainedEditHistoryService = () => {
  let retained;

  return {
    getRetainedEditHistory({ owner } = {}) {
      return retained?.owner === owner ? retained : undefined;
    },

    // Called by a page as it is left. A page left without steps keeps the
    // history of the page before it, unless that was its own.
    retainEditHistory({ owner, history, content } = {}) {
      // A page left before it opened its item has nothing to keep.
      if (owner === undefined) {
        return;
      }
      if (isEditHistoryEmpty(history)) {
        if (retained?.owner === owner) {
          retained = undefined;
        }
        return;
      }
      retained = { owner, history, content };
    },

    // Drops the kept history: `owner`'s, when its steps can no longer apply,
    // or any, for an editor that records steps but cannot keep its own.
    clearRetainedEditHistory({ owner } = {}) {
      if (owner === undefined || retained?.owner === owner) {
        retained = undefined;
      }
    },
  };
};
