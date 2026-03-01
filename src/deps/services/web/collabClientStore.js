import {
  loadCommittedCursor,
  saveCommittedCursor,
} from "./collabCommittedCursorStore.js";
import {
  createInMemoryClientStore,
  createPersistedCursorClientStore,
} from "insieme/client";

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
  const baseStore = createInMemoryClientStore({
    materializedViews,
  });
  return createPersistedCursorClientStore({
    store: baseStore,
    loadPersistedCursor: async () =>
      clampCursor(
        await loadCommittedCursor({
          adapter,
          projectId,
        }),
      ),
    savePersistedCursor: async (cursor) =>
      saveCommittedCursor({
        adapter,
        projectId,
        cursor: clampCursor(cursor),
      }),
    logger: (entry) => {
      logger({
        level: "warn",
        event: entry?.event || "cursor_persist_failed",
        projectId,
        error: entry?.message || "unknown",
        cursor: clampCursor(entry?.cursor),
      });
    },
  });
};
