import {
  loadCommittedCursor,
  saveCommittedCursor,
} from "./collabCommittedCursorStore.js";

const clampCursor = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  return Math.floor(parsed);
};

export const createPersistedInMemoryClientStore = async ({
  projectId,
  adapter,
  materializedViews = [],
  logger = () => {},
}) => {
  const insieme = await import("insieme");
  if (typeof insieme.createInMemoryClientStore !== "function") {
    throw new Error(
      "Insieme createInMemoryClientStore is unavailable. Install a compatible 1.x runtime.",
    );
  }

  const baseStore = insieme.createInMemoryClientStore({
    materializedViews,
  });

  let persistedCursor = 0;

  const persistCursor = async (nextCursor) => {
    const normalized = clampCursor(nextCursor);
    if (normalized <= persistedCursor) return persistedCursor;
    persistedCursor = normalized;
    try {
      await saveCommittedCursor({
        adapter,
        projectId,
        cursor: normalized,
      });
    } catch (error) {
      logger({
        level: "warn",
        event: "cursor_persist_failed",
        projectId,
        cursor: normalized,
        error: error?.message || "unknown",
      });
    }
    return persistedCursor;
  };

  return {
    async init() {
      await baseStore.init();
      persistedCursor = await loadCommittedCursor({
        adapter,
        projectId,
      });
      if (persistedCursor > 0) {
        await baseStore.applyCommittedBatch({
          events: [],
          nextCursor: persistedCursor,
        });
      }
    },
    async loadCursor() {
      const current = clampCursor(await baseStore.loadCursor());
      return Math.max(current, persistedCursor);
    },
    async insertDraft(item) {
      return baseStore.insertDraft(item);
    },
    async loadDraftsOrdered() {
      return baseStore.loadDraftsOrdered();
    },
    async applySubmitResult(input) {
      return baseStore.applySubmitResult(input);
    },
    async applyCommittedBatch({ events, nextCursor }) {
      await baseStore.applyCommittedBatch({ events, nextCursor });
      const current = clampCursor(await baseStore.loadCursor());
      const hinted = clampCursor(nextCursor);
      await persistCursor(Math.max(current, hinted));
    },
  };
};
