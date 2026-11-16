import { isEditHistoryEmpty } from "../../../internal/editHistory.js";

// Keeps one editor page's undo history after the page is left, so coming
// back to it brings undo and redo back. Only one history is kept: it belongs
// to the last editor an edit was recorded in, and is dropped when another
// editor is left with steps of its own. It lives in memory only.
//
// `owner` names the editor and the item it edits (`getEditHistoryOwner`).
// `content` is the item as the page left it, for pages whose steps hold the
// whole item (`resumeEditHistory` in src/internal/editHistory.js).
//
// The history belongs to one project. Copies of a project share item ids, so
// an editor opening in another project (`getProjectKey`) drops it.
//
// A step can refer to other items, such as a text style's font or a line's
// background image, and the project refuses a save that refers to an item
// that is gone. So the history is also dropped when anything the project
// held as the page was left (`getProjectState`) has been deleted since.

const isCollection = (value) =>
  value !== null &&
  typeof value === "object" &&
  value.items !== null &&
  typeof value.items === "object" &&
  Array.isArray(value.tree);

// Scene lines are loaded for the open scene only, and layout elements change
// as their editor saves on leaving; neither is referred to from elsewhere.
const UNTRACKED_COLLECTION_KEYS = new Set(["lines", "elements"]);

const addCollectionItemIds = (collection, itemIds) => {
  for (const [itemId, item] of Object.entries(collection.items)) {
    itemIds.add(itemId);
    for (const [key, value] of Object.entries(item ?? {})) {
      if (!UNTRACKED_COLLECTION_KEYS.has(key) && isCollection(value)) {
        addCollectionItemIds(value, itemIds);
      }
    }
  }
};

// The ids of every item in the project's collections, such as images, fonts,
// characters and their sprites, and scenes and their sections.
const collectProjectItemIds = (projectState) => {
  const itemIds = new Set();
  for (const value of Object.values(projectState ?? {})) {
    if (isCollection(value)) {
      addCollectionItemIds(value, itemIds);
    }
  }
  return itemIds;
};

export const createRetainedEditHistoryService = ({
  getProjectKey = () => "",
  getProjectState = () => undefined,
} = {}) => {
  let retained;

  // Undefined when no project is open to read. A history that cannot be
  // checked is not kept, and opening or leaving a page must still go on.
  const readProjectItemIds = () => {
    try {
      return collectProjectItemIds(getProjectState());
    } catch {
      return undefined;
    }
  };

  // The project of the editor opened last.
  let projectKey;

  return {
    // Called by an editor as it opens its item.
    getRetainedEditHistory({ owner } = {}) {
      const openProjectKey = getProjectKey();
      if (projectKey !== undefined && openProjectKey !== projectKey) {
        retained = undefined;
      }
      projectKey = openProjectKey;
      if (retained?.owner !== owner) {
        return undefined;
      }
      const itemIds = readProjectItemIds();
      if (
        !itemIds ||
        [...retained.itemIds].some((itemId) => !itemIds.has(itemId))
      ) {
        retained = undefined;
      }
      return retained;
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
      const itemIds = readProjectItemIds();
      retained = itemIds ? { owner, history, content, itemIds } : undefined;
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
