export const loadLocalProjectEntries = async ({ db } = {}) => {
  if (!db || typeof db.get !== "function") {
    return [];
  }

  try {
    const entries = await db.get("projectEntries");
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
};

export const isLocalProjectId = async ({ db, projectId } = {}) => {
  if (typeof projectId !== "string" || projectId.length === 0) {
    return false;
  }

  const entries = await loadLocalProjectEntries({ db });
  return entries.some(
    (entry) => typeof entry?.id === "string" && entry.id === projectId,
  );
};
