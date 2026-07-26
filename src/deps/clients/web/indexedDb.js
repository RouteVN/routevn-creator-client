const INSPECTION_ERROR_MESSAGE =
  "RouteVN Creator cannot verify that browser project storage is empty.";

export const listIndexedDbDatabaseNames = async () => {
  const indexedDb = globalThis.indexedDB;
  if (typeof indexedDb?.databases !== "function") {
    throw new Error(INSPECTION_ERROR_MESSAGE);
  }

  let databases;
  try {
    databases = await indexedDb.databases();
  } catch {
    throw new Error(INSPECTION_ERROR_MESSAGE);
  }
  if (!Array.isArray(databases)) {
    throw new Error(INSPECTION_ERROR_MESSAGE);
  }

  return new Set(
    databases
      .map((database) => database?.name)
      .filter((name) => typeof name === "string" && name.length > 0),
  );
};
