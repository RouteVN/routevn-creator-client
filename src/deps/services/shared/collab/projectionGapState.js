const PROJECTOR_GAP_KEY = "projectorGap";

const readAppValue = async (store, key) => {
  return store.app.get(key);
};

const writeAppValue = async (store, key, value) => {
  await store.app.set(key, value);
};

const removeAppValue = async (store, key) => {
  await store.app.remove(key);
};

export const loadProjectionGap = async (repositoryStore) => {
  const value = await readAppValue(repositoryStore, PROJECTOR_GAP_KEY);
  return value && typeof value === "object"
    ? structuredClone(value)
    : undefined;
};

export const saveProjectionGap = async (repositoryStore, gap) => {
  if (!gap || typeof gap !== "object") {
    return;
  }

  await writeAppValue(repositoryStore, PROJECTOR_GAP_KEY, structuredClone(gap));
};

export const clearProjectionGap = async (repositoryStore) => {
  await removeAppValue(repositoryStore, PROJECTOR_GAP_KEY);
};
