const COLLAB_CURSOR_KEY_PREFIX = "collab.lastCommittedId:";

const toNonNegativeInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  return Math.floor(parsed);
};

const getCursorKey = (projectId) => `${COLLAB_CURSOR_KEY_PREFIX}${projectId}`;

export const loadCommittedCursor = async ({ adapter, projectId }) => {
  if (!adapter?.app || typeof adapter.app.get !== "function") return 0;
  if (typeof projectId !== "string" || projectId.length === 0) return 0;
  const stored = await adapter.app.get(getCursorKey(projectId));
  return toNonNegativeInteger(stored);
};

export const saveCommittedCursor = async ({ adapter, projectId, cursor }) => {
  if (!adapter?.app || typeof adapter.app.set !== "function") return;
  if (typeof projectId !== "string" || projectId.length === 0) return;
  await adapter.app.set(getCursorKey(projectId), toNonNegativeInteger(cursor));
};

export const clearCommittedCursor = async ({ adapter, projectId }) => {
  if (!adapter?.app || typeof adapter.app.remove !== "function") return;
  if (typeof projectId !== "string" || projectId.length === 0) return;
  await adapter.app.remove(getCursorKey(projectId));
};
