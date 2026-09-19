import { generateId } from "../../internal/id.js";

const pendingIds = new WeakMap();

export const isDeviceId = (value) =>
  typeof value === "string" &&
  value.length === 12 &&
  /^[1-9A-HJ-NP-Za-km-z]{12}$/.test(value);

export const isDeviceMetadataText = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= 256 &&
  Array.from(value).every((character) => {
    const code = character.codePointAt(0);
    return code >= 32 && code !== 127;
  });

// App-local identity: independent of accounts, projects, and hardware identifiers.
export const getDeviceId = (keyValueStore) => {
  const pending = pendingIds.get(keyValueStore);
  if (pending) return pending;
  const next = (async () => {
    const existing = await keyValueStore.get("deviceId");
    if (isDeviceId(existing)) return existing;
    if (existing !== undefined && existing !== null)
      throw new Error("Invalid persisted device ID.");
    const deviceId = await keyValueStore.getOrSet("deviceId", generateId());
    if (!isDeviceId(deviceId)) throw new Error("Invalid persisted device ID.");
    return deviceId;
  })();
  pendingIds.set(keyValueStore, next);
  const clear = () => pendingIds.delete(keyValueStore);
  next.then(clear, clear);
  return next;
};
